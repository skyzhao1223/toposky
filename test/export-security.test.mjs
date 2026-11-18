import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { loadExportPolicy, prepareOutputDirectory, removeExportDirectory, scanExportTree } from '../scripts/lib/export-check.mjs'

const ROOT = process.cwd()
const exporter = path.join(ROOT, 'scripts/export-oss.mjs')
// Construct synthetic markers at runtime so test source contains no credentials.
const fakeToken = () => ['gh', 'p_'].join('') + 'A'.repeat(30)
const fakeKey = () => ['-----BEGIN ', 'PRIVATE', ' KEY-----'].join('')
const privateDomain = () => ['private', 'example', 'invalid'].join('.')
const policyFile = path.join('internal', 'public-export-policy.json')
function privatePolicy() {
  return { version: 1, rules: [{ category: '内部域名/仓库', pattern: privateDomain().replaceAll('.', '\\.'), flags: 'i' }] }
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'topo-export-security-'))
  const realRoot = fs.realpathSync(root)
  t.after(() => {
    assert.equal(fs.realpathSync(root), realRoot, 'verify owned temporary target before cleanup')
    fs.rmSync(realRoot, { recursive: true, force: true })
  })
  return root
}
function write(root, relative, content = 'synthetic fixture\n') {
  const file = path.join(root, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}
function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' } })
}
function repository(root) {
  const repo = path.join(root, 'source')
  fs.mkdirSync(repo)
  git(repo, 'init', '-q')
  for (const file of ['README.md', 'LICENSE', 'NOTICE', 'CONTRIBUTING.md', 'SECURITY.md', 'package-lock.json', 'examples/demo/topology.json', 'topology.schema.json']) {
    write(repo, file)
  }
  write(repo, 'package.json', JSON.stringify({ name: 'synthetic-release', license: 'MIT', scripts: { public: 'echo ready', private: ['node ', 'internal', '/private.mjs'].join('') } }))
  write(repo, 'scripts/export-oss.mjs', fs.readFileSync(exporter))
  write(repo, 'scripts/lib/export-check.mjs', fs.readFileSync(path.join(ROOT, 'scripts/lib/export-check.mjs')))
  write(repo, policyFile, JSON.stringify(privatePolicy()))
  return repo
}
function commit(repo) {
  // Commits are confined to synthetic temporary repositories, never this project.
  git(repo, 'add', '.')
  git(repo, '-c', 'user.name=Synthetic Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'synthetic test fixture')
}
function run(repo, output) {
  const result = spawnSync(process.execPath, [exporter, '--out', output], { cwd: repo, encoding: 'utf8' })
  assert.equal(result.error, undefined)
  return { ...result, log: result.stdout + result.stderr }
}

test('scan covers hidden, extensionless, unknown-extension and binary files without leaking values', (t) => {
  const root = fixture(t)
  const token = fakeToken()
  const key = fakeKey()
  write(root, '.hidden', token)
  write(root, 'nested/no-extension', key)
  write(root, 'nested/odd.unrecognized', token)
  write(root, 'binary.bin', Buffer.concat([Buffer.from([0, 255, 0]), Buffer.from(key)]))
  write(root, 'settings.json', JSON.stringify({ password: ['synthetic', 'password', 'value'].join('-') }))
  const result = scanExportTree(root)
  assert.equal(result.scannedFiles, 5)
  assert.equal(result.problems.length, 4)
  assert.equal(result.warnings.length, 1)
  const output = [...result.problems, ...result.warnings].join('\n')
  for (const value of [token, key, 'synthetic-password-value']) assert.equal(output.includes(value), false)
  assert.match(output, /\.hidden:1: \[GitHub Token\]/)
  assert.match(output, /no-extension:1: \[私钥\]/)
  assert.match(output, /binary\.bin:1: \[私钥\]/)
})

test('environment filenames are checked at every depth with example allowance', (t) => {
  const root = fixture(t)
  for (const file of ['.env', '.env.production', 'nested/.env.local', '.env.example', 'nested/.env.example']) write(root, file)
  const result = scanExportTree(root)
  assert.equal(result.problems.length, 3)
  assert.equal(result.scannedFiles, 5)
  assert.equal(result.problems.some((problem) => problem.includes('.env.example')), false)
})

test('exporter itself receives organization and credential rules without any exclusions', (t) => {
  const root = fixture(t)
  const token = fakeToken()
  write(root, 'scripts/export-oss.mjs', ['policy-identifier', token, fakeKey()].join('\n'))
  const result = scanExportTree(root, { internalPatterns: [['Policy', /policy-identifier/]] })
  assert.equal(result.scannedFiles, 1)
  assert.equal(result.problems.length, 3)
  assert.equal(result.problems.join('\n').includes(token), false)
})

test('output preparation preserves nonempty directories and rejects source boundaries and symlinks', (t) => {
  const root = fixture(t)
  const repo = path.join(root, 'source')
  fs.mkdirSync(repo)
  const occupied = path.join(root, 'occupied')
  write(occupied, 'keep.txt', 'do not delete')
  assert.throws(() => prepareOutputDirectory(repo, occupied), /非空/)
  assert.equal(fs.readFileSync(path.join(occupied, 'keep.txt'), 'utf8'), 'do not delete')
  for (const output of [repo, root, path.join(repo, 'new/output')]) {
    assert.throws(() => prepareOutputDirectory(repo, output), /仓库/)
  }
  const linked = path.join(root, 'linked')
  fs.symlinkSync(occupied, linked, 'dir')
  assert.throws(() => prepareOutputDirectory(repo, linked), /符号链接/)
  const dangling = path.join(root, 'dangling')
  fs.symlinkSync(path.join(root, 'missing'), dangling, 'dir')
  assert.throws(() => prepareOutputDirectory(repo, dangling), /符号链接/)
  const alias = path.join(root, 'repo-alias')
  fs.symlinkSync(repo, alias, 'dir')
  assert.throws(() => prepareOutputDirectory(repo, path.join(alias, 'child')), /仓库/)
  const output = path.join(root, 'fresh/nested')
  assert.equal(prepareOutputDirectory(repo, output), fs.realpathSync(output))
  assert.equal(prepareOutputDirectory(repo, output), fs.realpathSync(output), 'existing empty output is allowed')
})

test('cleanup validates containment and does not follow linked directories', (t) => {
  const root = fixture(t)
  const output = path.join(root, 'output')
  const outside = path.join(root, 'outside')
  write(output, 'junk/child')
  write(outside, 'keep.txt', 'preserve')
  assert.throws(() => removeExportDirectory(output, '../outside'), /拒绝/)
  fs.symlinkSync(outside, path.join(output, 'linked'), 'dir')
  assert.throws(() => removeExportDirectory(output, 'linked'), /符号链接/)
  assert.equal(removeExportDirectory(output, 'junk'), true)
  assert.equal(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'preserve')
  assert.equal(scanExportTree(output).problems.length, 1)
})

test('source private policy applies but is never published; every public file is scanned', (t) => {
  const root = fixture(t)
  const repo = repository(root)
  write(repo, '.env.example', 'TOPOLOGY_DATA=/demo/topology.json\n')
  write(repo, '.hidden', 'public fixture')
  // Verify committed input: uncommitted sensitive content is not archived.
  commit(repo)
  write(repo, 'not-committed.secret', fakeToken())
  const output = path.join(root, 'release')
  const result = run(repo, output)
  assert.equal(result.status, 0, result.log)
  assert.match(result.log, /含点文件与未知扩展名/)
  assert.match(result.log, /组织规则已配置：1 条/)
  assert.match(result.log, /扫描排除 0 个文件/)
  assert.match(result.log, /已配置的 1 条规则全量应用/)
  assert.equal(fs.existsSync(path.join(output, 'internal')), false)
  assert.equal(fs.existsSync(path.join(output, policyFile)), false)
  assert.equal(scanExportTree(output, { internalPatterns: loadExportPolicy(repo).patterns }).problems.length, 0)
  assert.match(result.log, /规则扫描不等于无凭证保证/)
  assert.equal(fs.existsSync(path.join(output, 'not-committed.secret')), false)
  const exported = JSON.parse(fs.readFileSync(path.join(output, 'package.json'), 'utf8'))
  assert.equal(exported.scripts.public, 'echo ready')
  assert.equal(exported.scripts.private, undefined)
  assert.equal(fs.existsSync(path.join(output, '.env.example')), true)
})

test('missing organization policy is explicit and never claims an organization audit', (t) => {
  const root = fixture(t)
  const repo = repository(root)
  const sourcePolicy = path.join(repo, policyFile)
  assert.equal(path.dirname(sourcePolicy), path.join(repo, 'internal'))
  fs.unlinkSync(sourcePolicy)
  commit(repo)
  const result = run(repo, path.join(root, 'release'))
  assert.equal(result.status, 0, result.log)
  assert.match(result.log, /组织规则未配置/)
  assert.match(result.log, /未审计组织特定标识/)
  assert.equal(result.log.includes('组织规则审计：'), false)
})

test('source organization policy and its literals are absent from public export', (t) => {
  const root = fixture(t)
  const repo = repository(root)
  // The public tree intentionally has no private policy. In that environment
  // this regression remains runnable with a synthetic policy instead.
  const configured = loadExportPolicy(ROOT).configured
  const content = configured ? fs.readFileSync(path.join(ROOT, policyFile)) : JSON.stringify(privatePolicy())
  write(repo, policyFile, content)
  commit(repo)
  const output = path.join(root, 'release')
  const result = run(repo, output)
  assert.equal(result.status, 0, result.log)
  assert.equal(fs.existsSync(path.join(output, 'internal')), false)
  const rules = loadExportPolicy(repo).patterns
  assert.ok(rules.length > 0)
  const checked = scanExportTree(output, { internalPatterns: rules })
  assert.equal(checked.scannedFiles, checked.files.length)
  assert.deepEqual(checked.problems, [])
})

test('configured source policy also scans the exported policy loader and exporter', (t) => {
  const root = fixture(t)
  const repo = repository(root)
  const marker = privateDomain()
  write(repo, 'scripts/export-oss.mjs', fs.readFileSync(exporter, 'utf8') + `\n// ${marker}\n`)
  write(repo, 'scripts/lib/export-check.mjs', fs.readFileSync(path.join(ROOT, 'scripts/lib/export-check.mjs'), 'utf8') + `\n// ${marker}\n`)
  commit(repo)
  const result = run(repo, path.join(root, 'release'))
  assert.equal(result.status, 1)
  assert.match(result.log, /scripts\/export-oss\.mjs:\d+: \[内部域名\/仓库\]/)
  assert.match(result.log, /scripts\/lib\/export-check\.mjs:\d+: \[内部域名\/仓库\]/)
  assert.equal(result.log.includes(marker), false)
})

test('private policy loader parses JSON and regular expressions without executing configuration', (t) => {
  const root = fixture(t)
  write(root, policyFile, JSON.stringify({ version: 1, rules: [{ category: 'Synthetic', pattern: 'globalThis.__exportPolicyExecuted = true' }] }))
  assert.equal(loadExportPolicy(root).configured, true)
  assert.equal(globalThis.__exportPolicyExecuted, undefined)
  assert.equal(loadExportPolicy(root).patterns.length, 1)
})

test('invalid private JSON/schema/regex/flags fail closed without echoing private values', (t) => {
  const root = fixture(t)
  const value = fakeToken()
  for (const content of [
    value,
    JSON.stringify({ version: 2, rules: [] }),
    JSON.stringify({ version: 1, rules: [{ category: 'Synthetic', pattern: '[' + value }] }),
    ...['g', 'y', 'ii'].map((flags) => JSON.stringify({ version: 1, rules: [{ category: 'Synthetic', pattern: value, flags }] })),
  ]) {
    write(root, policyFile, content)
    assert.throws(() => loadExportPolicy(root), (error) => {
      assert.match(error.message, /发布组织规则配置无效/)
      assert.equal(error.message.includes(value), false)
      return true
    })
  }
})

test('source private policy cannot be loaded through a symlink', (t) => {
  const root = fixture(t)
  const repo = repository(root)
  const sourcePolicy = path.join(repo, policyFile)
  const outside = path.join(root, 'outside-policy.json')
  write(root, 'outside-policy.json', JSON.stringify(privatePolicy()))
  assert.equal(path.dirname(sourcePolicy), path.join(repo, 'internal'))
  fs.unlinkSync(sourcePolicy)
  fs.symlinkSync(outside, sourcePolicy)
  assert.throws(() => loadExportPolicy(repo), /配置无效/)
})

test('export rejects committed environment files and hidden credentials without logging values', (t) => {
  const root = fixture(t)
  const repo = repository(root)
  const token = fakeToken()
  write(repo, '.env', 'synthetic environment fixture')
  write(repo, '.private/unknown.blob', token)
  commit(repo)
  const output = path.join(root, 'release')
  const result = run(repo, output)
  assert.equal(result.status, 1)
  assert.match(result.log, /\.env: 疑似本地环境文件/)
  assert.match(result.log, /unknown\.blob:1: \[GitHub Token\]/)
  assert.equal(result.log.includes(token), false)
  assert.equal(fs.existsSync(path.join(output, '.git')), false)
})

test('export accepts protection globs and synthetic fixture paths without blanket file exclusions', (t) => {
  const root = fixture(t)
  const repo = repository(root)
  const protectedPath = ['internal', '/'].join('')
  write(repo, 'next.config.js', `module.exports = { outputFileTracingExcludes: { '/*': ['./${protectedPath}**/*'] } }\n`)
  write(repo, 'test/synthetic.mjs', `fixture.write('${protectedPath}report.md', 'fictional fixture')\n`)
  write(repo, '.dockerignore', protectedPath + '**\n')
  commit(repo)
  const result = run(repo, path.join(root, 'release'))
  assert.equal(result.status, 0, result.log)
})

test('export still rejects real module dependencies, documentation links and script instructions', (t) => {
  const root = fixture(t)
  const repo = repository(root)
  const target = ['internal', '/private.mjs'].join('')
  const references = [
    ['src/import.ts', `import x from './${target}'`],
    ['src/export.ts', `export { x } from '../${target}'`],
    ['src/require.cjs', `const x = require('./${target}')`],
    ['src/dynamic.ts', `await import('./${target}')`],
    ['src/multiline.ts', `import {\n  x,\n} from './${target}'`],
    ['docs/link.md', `[Private](../${target})`],
    ['docs/reference.md', `[private]: ../${target}`],
    ['docs/embed.html', `<a href="../${target}">Private</a>`],
    ['docs/run.md', `node --experimental-strip-types "./${target}"`],
  ]
  for (const [file, content] of references) write(repo, file, content)
  commit(repo)
  const result = run(repo, path.join(root, 'release'))
  assert.equal(result.status, 1)
  for (const [file] of references) {
    assert.ok(result.log.includes(file + ':'), `missing dependency finding for ${file}`)
  }
  assert.match(result.log, /\[内部路径引用\]/)
})

test('safe protection references never suppress organization or credential checks in config/tests', (t) => {
  const root = fixture(t)
  const repo = repository(root)
  const protectedPath = ['internal', '/'].join('')
  const domain = privateDomain()
  const token = fakeToken()
  write(repo, 'next.config.js', `const protectedGlob = './${protectedPath}**/*'; const endpoint = '${domain}'\n`)
  write(repo, 'test/synthetic.mjs', `fixture.write('${protectedPath}report.md', '${token}')\n`)
  commit(repo)
  const result = run(repo, path.join(root, 'release'))
  assert.equal(result.status, 1)
  assert.match(result.log, /next\.config\.js:1: \[内部域名\/仓库\]/)
  assert.match(result.log, /synthetic\.mjs:1: \[GitHub Token\]/)
  assert.equal(result.log.includes(token), false)
  assert.equal(result.log.includes(domain), false)
})

test('export rejects tracked symlinks before extraction and refuses occupied output', (t) => {
  const root = fixture(t)
  const repo = repository(root)
  commit(repo)
  const output = path.join(root, 'occupied')
  write(output, 'keep.txt', 'preserve')
  const occupied = run(repo, output)
  assert.equal(occupied.status, 2)
  assert.equal(fs.readFileSync(path.join(output, 'keep.txt'), 'utf8'), 'preserve')
  fs.symlinkSync('../outside', path.join(repo, 'linked'))
  commit(repo)
  const fresh = path.join(root, 'fresh')
  const linked = run(repo, fresh)
  assert.equal(linked.status, 2)
  assert.match(linked.log, /符号链接或子模块/)
  assert.equal(fs.existsSync(fresh), false)
})

test('gitignore hides all local environment variants but retains example templates', (t) => {
  const root = fixture(t)
  git(root, 'init', '-q')
  write(root, '.gitignore', fs.readFileSync(path.join(ROOT, '.gitignore')))
  for (const file of ['.env', '.env.production', '.env.production.local', 'nested/.env', 'nested/.env.test']) {
    const result = spawnSync('git', ['check-ignore', '--no-index', file], { cwd: root, encoding: 'utf8' })
    assert.equal(result.status, 0, file)
  }
  for (const file of ['.env.example', 'nested/.env.example']) {
    const result = spawnSync('git', ['check-ignore', '--no-index', file], { cwd: root, encoding: 'utf8' })
    assert.equal(result.status, 1, file)
  }
})
