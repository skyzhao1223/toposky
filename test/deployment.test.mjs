import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'
import yaml from 'js-yaml'
import { initializeDefaultData } from '../scripts/docker-entrypoint.mjs'
import { assertHealthyTopology, checkHealth } from '../scripts/healthcheck.mjs'
import { normalizeBasePath, normalizeRoutePath, pagesBasePath } from '../scripts/lib/demo-path.mjs'
import { prepareDemoSource, protectedSourceFingerprint, validateDemoOutputTarget, publishDemoOutput, DEMO_ROUTES } from '../scripts/lib/demo-build.mjs'
import { demoBuildEnvironment } from '../scripts/build-demo.mjs'
import { checkDemo } from '../scripts/check-demo.mjs'

const topology = { nodes: [{ id: 'fictional-a' }, { id: 'fictional-b' }], relations: [{ id: 'r1', source: 'fictional-a', target: 'fictional-b' }] }
const repo = path.resolve(import.meta.dirname, '..')
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'toposky-deployment-test-')))
  const tmp = fs.realpathSync(os.tmpdir())
  t.after(() => {
    assert.equal(path.dirname(root), tmp)
    assert.ok(path.basename(root).startsWith('toposky-deployment-test-'))
    assert.equal(fs.realpathSync(root), root)
    fs.rmSync(root, { recursive: true })
  })
  function write(relative, data) {
    const target = path.join(root, relative)
    assert.ok(target.startsWith(root + path.sep))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, typeof data === 'string' ? data : JSON.stringify(data))
  }
  return { root, write }
}
function demoFixture(t) {
  const f = fixture(t)
  for (const file of ['package.json', 'package-lock.json', 'tsconfig.json']) f.write(file, {})
  for (const file of ['next.config.js', 'postcss.config.js', 'scripts/lib/demo-path.mjs', 'scripts/third-party-notices.mjs']) f.write(file, '// public fixture')
  for (const file of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'licenses/MIT.txt']) f.write(file, 'public license fixture')
  f.write('examples/demo/topology.json', topology)
  f.write('src/app/page.tsx', 'export default function Page() { return null }')
  f.write('src/app/api/topology/route.ts', 'private server route')
  f.write('src/data/topology.json', 'legacy-private-data')
  f.write('data/topology.json', 'private-instance')
  f.write('internal/report.md', 'private report')
  f.write('.env', 'PRIVATE_SECRET=do-not-copy')
  f.write('.next/dev/cache/sentinel', 'development-cache')
  return f
}

test('entrypoint initializes only the empty controlled default directory', (t) => {
  const f = fixture(t)
  const directory = path.join(f.root, 'default-data')
  fs.mkdirSync(directory)
  f.write('examples/demo/topology.json', topology)
  const options = { root: f.root, defaultDirectory: directory, env: { TOPOLOGY_DATA_DIR: directory } }
  assert.equal(initializeDefaultData(options), true)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'topology.json'), 'utf8')), topology)
  assert.equal(initializeDefaultData(options), false)
})

test('entrypoint never overwrites an existing file, including corrupt operator data', (t) => {
  const f = fixture(t)
  f.write('data/topology.json', 'invalid-existing-data')
  f.write('examples/demo/topology.json', topology)
  const directory = path.join(f.root, 'data')
  assert.equal(initializeDefaultData({ root: f.root, defaultDirectory: directory, env: { TOPOLOGY_DATA_DIR: directory } }), false)
  assert.equal(fs.readFileSync(path.join(directory, 'topology.json'), 'utf8'), 'invalid-existing-data')
})

test('entrypoint leaves custom explicit paths and nonempty default volumes untouched', (t) => {
  const f = fixture(t)
  f.write('data/operator-file.txt', 'keep')
  const directory = path.join(f.root, 'data')
  for (const env of [{ TOPOLOGY_DATA_DIR: '/custom' }, { TOPOLOGY_DATA_DIR: directory, TOPOLOGY_DATA: '/explicit/missing.json' }, { TOPOLOGY_DATA_DIR: directory, TOPOLOGY_ROOT: '/explicit-root' }, { TOPOLOGY_DATA_DIR: directory }]) {
    assert.equal(initializeDefaultData({ root: f.root, defaultDirectory: directory, env }), false)
  }
  assert.equal(fs.existsSync(path.join(directory, 'topology.json')), false)
})

test('entrypoint rejects a symlinked default directory and preserves dangling file links', (t) => {
  const f = fixture(t)
  fs.mkdirSync(path.join(f.root, 'actual'))
  fs.symlinkSync(path.join(f.root, 'actual'), path.join(f.root, 'data'), 'dir')
  assert.throws(() => initializeDefaultData({ defaultDirectory: path.join(f.root, 'data'), env: { TOPOLOGY_DATA_DIR: path.join(f.root, 'data') } }), /Unsafe/)
  fs.symlinkSync(path.join(f.root, 'missing'), path.join(f.root, 'actual', 'topology.json'))
  assert.equal(initializeDefaultData({ defaultDirectory: path.join(f.root, 'actual'), env: { TOPOLOGY_DATA_DIR: path.join(f.root, 'actual') } }), false)
})

test('health checks require usable JSON, valid references and optional exact demo contents', async () => {
  assert.deepEqual(assertHealthyTopology(topology), { nodes: 2, relations: 1 })
  for (const data of [{ nodes: [], relations: [] }, {}, { ...topology, nodes: [null] }, { ...topology, relations: [{ id: 'r1', source: 'absent', target: 'fictional-b' }] }]) assert.throws(() => assertHealthyTopology(data))
  const response = (body, status = 200) => async () => Response.json(body, { status })
  assert.deepEqual(await checkHealth({ fetcher: response(topology), expectedDemo: topology }), { nodes: 2, relations: 1 })
  await assert.rejects(checkHealth({ fetcher: response(topology, 503) }))
  await assert.rejects(checkHealth({ fetcher: async () => new Response('<html>not JSON</html>') }))
  await assert.rejects(checkHealth({ fetcher: response({ nodes: [], relations: [] }) }))
  await assert.rejects(checkHealth({ fetcher: response(topology), expectedDemo: { ...topology, marker: 'different' } }))
})

function loadTopologyGET({ raw = JSON.stringify(topology), missing = false, valid = true } = {}) {
  const source = fs.readFileSync(path.join(repo, 'src/app/api/topology/route.ts'), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
  const dependencies = {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    fs: { readFileSync: () => raw },
    '@/lib/validateTopology': { validateTopology: () => ({ ok: valid }) },
    '@/lib/gitStore': { currentVersion: () => 'version-test' },
    '@/lib/dataPath': { requireDataFile: () => {
      if (missing) throw new Error('ENOENT /private/customer/topology.json')
      return { file: '/private/customer/topology.json', display: 'examples/demo/topology.json', isDemo: true }
    } },
  }
  const exports = {}
  vm.runInNewContext(compiled, { exports, require: (id) => { assert.ok(id in dependencies, `Unexpected route dependency: ${id}`); return dependencies[id] } })
  return exports.GET
}

test('topology GET missing/corrupt/invalid data returns safe 503, not an empty success', async () => {
  for (const options of [{ missing: true }, { raw: 'invalid-json' }, { raw: '{}' }, { valid: false }]) {
    const response = await loadTopologyGET(options)()
    assert.equal(response.status, 503)
    const body = await response.json()
    assert.equal(body.code, 'TOPOLOGY_DATA_UNAVAILABLE')
    assert.equal(JSON.stringify(body).includes('/private'), false)
    assert.equal(response.headers.has('X-Topology-Source'), false)
  }
  const good = await loadTopologyGET()()
  assert.equal(good.status, 200)
  assert.deepEqual(await good.json(), topology)
})

test('base path supports project/user Pages and nav active states with trailing slashes', () => {
  assert.equal(pagesBasePath('owner/toposky'), '/toposky')
  assert.equal(pagesBasePath('owner/owner.github.io'), '')
  assert.equal(normalizeBasePath('/toposky/'), '/toposky')
  assert.equal(normalizeRoutePath('/toposky/topology/', '/toposky'), '/topology')
  assert.equal(normalizeRoutePath('/topology/', '/toposky'), '/topology')
  assert.equal(normalizeRoutePath('/toposky/', '/toposky'), '/')
  assert.equal(normalizeRoutePath('/toposky-other/', '/toposky'), '/toposky-other')
  for (const value of ['//elsewhere', '/../data', '/repo/../data', 'https://example.com', '/a?b']) assert.throws(() => normalizeBasePath(value))
})

test('Next normal config stays root and excludes private traces without excluding demo', () => {
  const run = (env) => {
    const result = spawnSync(process.execPath, ['-e', "require('./next.config.js')().then(c => console.log(JSON.stringify(c)))"], { cwd: repo, env: { ...process.env, ...env }, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return JSON.parse(result.stdout)
  }
  const normal = run({ NEXT_STATIC_EXPORT: '', NEXT_PUBLIC_BASE_PATH: '/toposky' })
  assert.equal(normal.basePath, '')
  assert.equal(normal.output, 'standalone')
  for (const prefix of ['./data/', './internal/', './src/data/', './.env', './.git/', './test-results/', './.playwright-mcp/']) assert.ok(normal.outputFileTracingExcludes['/*'].some((pattern) => pattern.startsWith(prefix)))
  assert.equal(normal.outputFileTracingExcludes['/*'].some((pattern) => pattern.includes('examples/demo')), false)
  const demo = run({ NEXT_STATIC_EXPORT: '1', NEXT_PUBLIC_BASE_PATH: '/toposky/' })
  assert.equal(demo.basePath, '/toposky')
  assert.equal(demo.trailingSlash, true)
  assert.equal(demo.output, 'export')
})

test('isolated public-source allow-list omits API, private trees and env without touching source/cache', (t) => {
  const f = demoFixture(t)
  const staging = fixture(t)
  const before = protectedSourceFingerprint(f.root)
  prepareDemoSource(f.root, staging.root, { linkDependencies: false })
  for (const relative of ['src/app/api', 'src/data', 'data', 'internal', '.env', '.next']) assert.equal(fs.existsSync(path.join(staging.root, relative)), false, relative)
  assert.equal(fs.existsSync(path.join(staging.root, 'src/app/page.tsx')), true)
  assert.equal(fs.existsSync(path.join(staging.root, 'examples/demo/topology.json')), true)
  assert.equal(protectedSourceFingerprint(f.root), before)
})

test('demo staging rejects symlink inputs and sanitizes private build environment', (t) => {
  const f = demoFixture(t)
  fs.symlinkSync(path.join(f.root, 'data'), path.join(f.root, 'src', 'leaked-data'), 'dir')
  assert.throws(() => prepareDemoSource(f.root, fixture(t).root, { linkDependencies: false }), /symlink/)
  const env = demoBuildEnvironment({ PATH: '/bin', TOPOLOGY_DATA: '/private', NEXT_PUBLIC_CUSTOMER: 'private', NODE_OPTIONS: '--require evil', TOKEN: 'secret' }, '/toposky')
  assert.equal(env.PATH, '/bin')
  assert.equal(env.NEXT_PUBLIC_BASE_PATH, '/toposky')
  for (const key of ['TOPOLOGY_DATA', 'NEXT_PUBLIC_CUSTOMER', 'NODE_OPTIONS', 'TOKEN']) assert.equal(key in env, false)
})

test('output replacement refuses user directories/symlinks, permits only recognised demo exports', (t) => {
  const unknown = fixture(t)
  unknown.write('out/important.txt', 'do not delete')
  assert.throws(() => validateDemoOutputTarget(unknown.root), /unrecognised/)
  const linked = fixture(t)
  fs.symlinkSync(unknown.root, path.join(linked.root, 'out'), 'dir')
  assert.throws(() => validateDemoOutputTarget(linked.root), /Unsafe/)
  const owned = fixture(t)
  owned.write('out/.demo-build-manifest.json', { generator: 'toposky-demo', schemaVersion: 1 })
  const compiled = fixture(t)
  compiled.write('index.html', 'new output')
  assert.equal(publishDemoOutput(owned.root, compiled.root), path.join(owned.root, 'out'))
  assert.equal(fs.readFileSync(path.join(owned.root, 'out/index.html'), 'utf8'), 'new output')
  assert.equal(fs.readFileSync(path.join(unknown.root, 'out/important.txt'), 'utf8'), 'do not delete')
})

function staticFixture(t, prefix = '/toposky') {
  const f = fixture(t)
  const nav = DEMO_ROUTES.filter((route) => route !== '/flows').map((route) => `<a href="${prefix}${route === '/' ? '/' : `${route}/`}">Nav</a>`).join('')
  const html = `<html><head><link rel="icon" href="${prefix}/icon.svg"><link rel="stylesheet" href="${prefix}/_next/static/app.css"></head><body>${nav}<script src="${prefix}/_next/static/app.js"></script></body></html>`
  for (const route of DEMO_ROUTES) f.write(route === '/' ? 'out/index.html' : `out/${route.slice(1)}/index.html`, html)
  f.write('out/icon.svg', '<svg/>')
  f.write('out/_next/static/app.js', '// public')
  f.write('out/_next/static/app.css', 'body{}')
  for (const file of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.txt']) f.write(`out/legal/${file}`, 'public license')
  f.write('out/.demo-build-manifest.json', { generator: 'toposky-demo', schemaVersion: 1, basePath: prefix, sourceUnchanged: true, apiExcluded: true, sourceFingerprint: protectedSourceFingerprint(f.root) })
  return f
}

test('static verification checks every page, prefixed resources/nav/legal and source preservation', (t) => {
  const f = staticFixture(t)
  const result = checkDemo({ directory: path.join(f.root, 'out'), sourceRoot: f.root, basePath: '/toposky' })
  assert.equal(result.routes, 7)
  assert.equal(result.pages, 7)
  assert.equal(result.apiRoutes, 0)
  f.write('src/app/api/route.ts', 'source changed')
  assert.throws(() => checkDemo({ directory: path.join(f.root, 'out'), sourceRoot: f.root }), /source\/cache changed/)
})

test('static verification rejects unprefixed/missing resources, wrong nav and API artifacts', (t) => {
  for (const [file, body, error] of [
    ['out/_next/static/app.css', 'body{background:url(/icon.svg)}', /escapes/],
    ['out/_next/static/app.css', 'body{background:url(missing.png)}', /Missing/],
    ['out/index.html', '<a href="/toposky/">Home only</a>', /Missing prefixed navigation/],
    ['out/api/topology.json', '{}', /Forbidden/],
  ]) {
    const f = staticFixture(t)
    f.write(file, body)
    assert.throws(() => checkDemo({ directory: path.join(f.root, 'out'), sourceRoot: f.root }), error)
  }
})

test('deployment files bind only Compose localhost and wire content health plus legal delivery', () => {
  const compose = fs.readFileSync(path.join(repo, 'docker-compose.yml'), 'utf8')
  const dockerfile = fs.readFileSync(path.join(repo, 'Dockerfile'), 'utf8')
  assert.ok(compose.includes('127.0.0.1:3000:3000'))
  assert.ok(dockerfile.includes('HOSTNAME=0.0.0.0'))
  assert.ok(dockerfile.includes('ENTRYPOINT ["node", "scripts/docker-entrypoint.mjs"]'))
  assert.ok(dockerfile.includes('CMD node scripts/healthcheck.mjs'))
  assert.ok(dockerfile.includes('notices:check && npm run notices:bundle && npm run build'))
  assert.ok(dockerfile.includes('/app/build/legal ./licenses'))
})

test('push only validates Pages; deployment requires an explicit manual opt-in', () => {
  const workflow = yaml.load(fs.readFileSync(path.join(repo, '.github/workflows/pages.yml'), 'utf8'))
  const optIn = workflow.on.workflow_dispatch.inputs.deploy
  assert.equal(optIn.type, 'boolean')
  assert.equal(optIn.default, false)
  assert.equal(workflow.jobs.deploy.if, "github.event_name == 'workflow_dispatch' && inputs.deploy")
  assert.equal(workflow.permissions.contents, 'read')
  assert.equal(workflow.permissions.pages, undefined)
  assert.equal(workflow.permissions['id-token'], undefined)
  assert.equal(workflow.jobs.deploy.permissions.pages, 'write')
  assert.equal(workflow.jobs.deploy.permissions['id-token'], 'write')
  assert.equal(workflow.jobs.build.steps.some((step) => step.uses?.startsWith('actions/configure-pages@')), false)
  assert.equal(workflow.jobs.build.steps.some((step) => step.uses?.startsWith('actions/deploy-pages@')), false)
  assert.equal(workflow.jobs.deploy.steps.some((step) => step.uses?.startsWith('actions/configure-pages@')), true)
})
