import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
// Exercise real handlers directly, without a server or generated build artifacts.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      return nextResolve(pathToFileURL(path.join(ROOT, 'src', specifier.slice(2) + '.ts')).href, context)
    }
    if (specifier === 'next/server') return nextResolve('next/server.js', context)
    return nextResolve(specifier, context)
  },
})
const P = await import(pathToFileURL(path.join(ROOT, 'src/lib/versionPath.ts')).href)
const collection = await import(pathToFileURL(path.join(ROOT, 'src/app/api/versions/route.ts')).href)
const snapshot = await import(pathToFileURL(path.join(ROOT, 'src/app/api/versions/[id]/route.ts')).href)
const restore = await import(pathToFileURL(path.join(ROOT, 'src/app/api/versions/[id]/restore/route.ts')).href)
const diff = await import(pathToFileURL(path.join(ROOT, 'src/app/api/versions/diff/route.ts')).href)
process.on('exit', () => hooks.deregister())

const keys = ['TOPOLOGY_ROOT', 'TOPOLOGY_DATA_DIR', 'TOPOLOGY_DATA']
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'topo-version-security-'))
  const realRoot = fs.realpathSync(root)
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  process.env.TOPOLOGY_ROOT = root
  process.env.TOPOLOGY_DATA_DIR = path.join(root, 'store')
  process.env.TOPOLOGY_DATA = path.join(root, 'store/topology.json')
  const versions = path.join(root, 'store/versions')
  fs.mkdirSync(versions, { recursive: true })
  const current = { nodes: [{ id: 'new', name: 'New' }], relations: [] }
  const previous = { nodes: [{ id: 'old', name: 'Old' }], relations: [] }
  fs.writeFileSync(process.env.TOPOLOGY_DATA, JSON.stringify(current))
  fs.writeFileSync(path.join(versions, 'v-1.json'), JSON.stringify(previous))
  fs.writeFileSync(path.join(versions, 'index.json'), JSON.stringify({ versions: [{ id: 'v-1' }] }))
  t.after(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    assert.equal(fs.realpathSync(root), realRoot, 'verify owned temporary target before cleanup')
    fs.rmSync(realRoot, { recursive: true, force: true })
  })
  return { root, versions, current, previous, data: process.env.TOPOLOGY_DATA }
}
const request = () => new Request('http://localhost/api/versions')
const createRequest = () => new Request('http://localhost/api/versions', { method: 'POST', body: JSON.stringify({ name: 'Synthetic version' }) })
const params = (id) => ({ params: Promise.resolve({ id }) })
const diffRequest = (from, to = 'current') => new Request('http://localhost/api/versions/diff?' + new URLSearchParams({ from, to }))
const invalid = ['../topology', '..\\topology', 'v-1/..', 'v-1\\x', '%2e%2e', '%252e%252e', 'v-1%2f', 'v-1%5c', '%76-1', 'v-1.json', 'index', 'current', 'v-1\0', 'v-1\n', 'v-1\r\n', ' v-1', 'v-1 ', 'v-' + '1'.repeat(21)]

test('snapshot whitelist rejects traversal, encoded variants and reserved tokens', (t) => {
  const f = fixture(t)
  assert.equal(P.snapshotPath(f.versions, 'v-1'), path.join(fs.realpathSync(f.versions), 'v-1.json'))
  for (const id of invalid) assert.throws(() => P.snapshotPath(f.versions, id), P.InvalidVersionPathError)
  P.assertVersionId('current', true)
})

test('GET, DELETE and restore reject invalid IDs with 400 without writes', async (t) => {
  const f = fixture(t)
  const before = fs.readFileSync(f.data, 'utf8')
  for (const id of invalid) {
    for (const handler of [snapshot.GET, snapshot.DELETE, restore.POST]) {
      const response = await handler(request(), params(id))
      assert.equal(response.status, 400, `${handler.name}: ${JSON.stringify(id)}`)
      assert.deepEqual(await response.json(), { error: '版本 ID 或路径无效' })
    }
  }
  assert.equal(fs.readFileSync(f.data, 'utf8'), before)
  assert.deepEqual(fs.readdirSync(f.versions).sort(), ['index.json', 'v-1.json'])
})

test('diff validates both parameters before reading and supports current token', async (t) => {
  const f = fixture(t)
  assert.equal((await diff.GET(diffRequest('v-1'))).status, 200)
  const response = await diff.GET(diffRequest('current', 'current'))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).summary, '无变更')
  fs.unlinkSync(f.data)
  for (const id of invalid.filter((id) => id !== 'current')) {
    assert.equal((await diff.GET(diffRequest(id))).status, 400)
    assert.equal((await diff.GET(diffRequest('current', id))).status, 400)
  }
})

test('snapshot symlinks, including dangling and in-directory aliases, return 400', async (t) => {
  const f = fixture(t)
  const outside = path.join(f.root, 'outside.json')
  fs.writeFileSync(outside, JSON.stringify(f.current))
  for (const [id, target] of [['v-2', outside], ['v-3', path.join(f.root, 'missing.json')], ['v-4', path.join(f.versions, 'v-1.json')]]) {
    fs.symlinkSync(target, path.join(f.versions, `${id}.json`))
    for (const handler of [snapshot.GET, snapshot.DELETE, restore.POST]) {
      assert.equal((await handler(request(), params(id))).status, 400)
    }
    assert.equal((await diff.GET(diffRequest(id))).status, 400)
  }
  assert.equal(fs.readFileSync(outside, 'utf8'), JSON.stringify(f.current))
})

test('version directory symlink and linked index are rejected', async (t) => {
  const f = fixture(t)
  const index = path.join(f.versions, 'index.json')
  const outside = path.join(f.root, 'outside-index.json')
  fs.writeFileSync(outside, JSON.stringify({ versions: [{ id: 'v-1' }] }))
  fs.unlinkSync(index)
  fs.symlinkSync(outside, index)
  assert.equal((await snapshot.DELETE(request(), params('v-1'))).status, 400)
  assert.equal((await restore.POST(request(), params('v-1'))).status, 400)
  assert.equal((await collection.GET()).status, 400)
  assert.equal((await collection.POST(createRequest())).status, 400)
  assert.ok(fs.existsSync(path.join(f.versions, 'v-1.json')))
  const alias = path.join(f.root, 'alias')
  fs.symlinkSync(f.versions, alias, 'dir')
  assert.throws(() => P.snapshotPath(alias, 'v-1'), P.InvalidVersionPathError)
})

test('valid snapshots retain GET, restore, automatic backup and DELETE behavior', async (t) => {
  const f = fixture(t)
  const read = await snapshot.GET(request(), params('v-1'))
  assert.equal(read.status, 200)
  assert.deepEqual(await read.json(), f.previous)
  const restored = await restore.POST(request(), params('v-1'))
  assert.equal(restored.status, 200)
  const body = await restored.json()
  assert.deepEqual(body.data, f.previous)
  assert.deepEqual(JSON.parse(fs.readFileSync(f.data, 'utf8')), f.previous)
  assert.deepEqual(JSON.parse(fs.readFileSync(P.snapshotPath(f.versions, body.backupVersion.id), 'utf8')), f.current)
  assert.equal((await snapshot.DELETE(request(), params('v-1'))).status, 200)
  assert.equal(fs.existsSync(path.join(f.versions, 'v-1.json')), false)
})

test('collection GET and POST retain valid snapshot creation behavior', async (t) => {
  const f = fixture(t)
  assert.equal((await collection.GET()).status, 200)
  const response = await collection.POST(createRequest())
  assert.equal(response.status, 200)
  const { version } = await response.json()
  assert.match(version.id, /^v-[0-9]+$/)
  assert.deepEqual(JSON.parse(fs.readFileSync(P.snapshotPath(f.versions, version.id), 'utf8')), f.current)
  assert.equal(JSON.parse(fs.readFileSync(P.versionIndexPath(f.versions), 'utf8')).versions[0].id, version.id)
})

test('restore and collection writes reject linked snapshot destinations and temporary files', async (t) => {
  const f = fixture(t)
  const outside = path.join(f.root, 'outside.json')
  fs.writeFileSync(outside, 'preserve outside')
  const originalNow = Date.now
  Date.now = () => 2
  t.after(() => { Date.now = originalNow })
  const beforeIndex = fs.readFileSync(P.versionIndexPath(f.versions), 'utf8')
  const beforeData = fs.readFileSync(f.data, 'utf8')
  for (const suffix of ['.json', '.json.tmp']) {
    const target = path.join(f.versions, 'v-2' + suffix)
    fs.symlinkSync(outside, target)
    assert.equal((await collection.POST(createRequest())).status, 400)
    assert.equal((await restore.POST(request(), params('v-1'))).status, 400)
    assert.equal(fs.readFileSync(outside, 'utf8'), 'preserve outside')
    assert.equal(fs.readFileSync(f.data, 'utf8'), beforeData)
    assert.equal(fs.readFileSync(P.versionIndexPath(f.versions), 'utf8'), beforeIndex)
    assert.equal(path.dirname(target), f.versions)
    fs.unlinkSync(target)
  }
})

test('all version handlers reject a linked version-store directory', async (t) => {
  const f = fixture(t)
  const saved = path.join(f.root, 'saved-versions')
  assert.equal(fs.realpathSync(f.versions), path.join(fs.realpathSync(path.dirname(f.versions)), 'versions'))
  assert.equal(path.dirname(saved), f.root)
  fs.renameSync(f.versions, saved)
  fs.symlinkSync(saved, f.versions, 'dir')
  assert.equal((await collection.GET()).status, 400)
  assert.equal((await collection.POST(createRequest())).status, 400)
  for (const handler of [snapshot.GET, snapshot.DELETE, restore.POST]) {
    assert.equal((await handler(request(), params('v-1'))).status, 400)
  }
  assert.equal((await diff.GET(diffRequest('v-1'))).status, 400)
  assert.deepEqual(fs.readdirSync(saved).sort(), ['index.json', 'v-1.json'])
})

test('valid missing snapshots preserve 404 responses', async (t) => {
  fixture(t)
  assert.equal((await snapshot.GET(request(), params('v-999'))).status, 404)
  assert.equal((await snapshot.DELETE(request(), params('v-999'))).status, 404)
  assert.equal((await restore.POST(request(), params('v-999'))).status, 404)
})
