/**
 * 数据位置解析测试（数据与代码分离的核心契约）。
 *
 * 锁住：
 *   - 优先级：TOPOLOGY_DATA > TOPOLOGY_DATA_DIR > ./data > 旧布局 src/data > 示例；
 *   - 命中示例时 isDemo=true（界面/接口据此提示「当前是演示数据」）；
 *   - 首次保存会把示例复制到实例目录（开箱即用，且不污染仓库）；
 *   - 版本快照目录跟随实例目录。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const D = await import(pathToFileURL(path.join(ROOT, 'src/lib/dataPath.ts')).href)

const ENV_KEYS = ['TOPOLOGY_ROOT', 'TOPOLOGY_DATA', 'TOPOLOGY_DATA_DIR']

/** 每个用例独立的空目录 + 干净环境 */
function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'topo-path-test-'))
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  ENV_KEYS.forEach((k) => delete process.env[k])
  process.env.TOPOLOGY_ROOT = dir
  return {
    dir,
    write(rel, content = '{"nodes":[],"relations":[]}') {
      const p = path.join(dir, rel)
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, content)
      return p
    },
    restore() {
      ENV_KEYS.forEach((k) => {
        if (saved[k] === undefined) delete process.env[k]
        else process.env[k] = saved[k]
      })
      fs.rmSync(dir, { recursive: true, force: true })
    },
  }
}

test('没有任何数据文件时返回 null', (t) => {
  const s = sandbox()
  t.after(() => s.restore())
  assert.equal(D.resolveDataFile(), null)
})

test('实例目录优先于示例数据', (t) => {
  const s = sandbox()
  t.after(() => s.restore())
  s.write('data/topology.json')
  s.write('examples/demo/topology.json')
  const loc = D.resolveDataFile()
  assert.ok(loc)
  assert.equal(loc.isDemo, false)
  assert.equal(loc.source, 'data-dir')
  assert.match(loc.display, /data\/topology\.json$/)
})

test('仅存在示例数据时标记为 demo', (t) => {
  const s = sandbox()
  t.after(() => s.restore())
  s.write('examples/demo/topology.json')
  const loc = D.resolveDataFile()
  assert.equal(loc.isDemo, true)
  assert.equal(loc.source, 'demo')
})

test('TOPOLOGY_DATA 显式指定优先级最高', (t) => {
  const s = sandbox()
  t.after(() => s.restore())
  s.write('data/topology.json')
  s.write('custom/my-topology.json')
  process.env.TOPOLOGY_DATA = 'custom/my-topology.json'
  const loc = D.resolveDataFile()
  assert.equal(loc.file, path.join(s.dir, 'custom/my-topology.json'))
  assert.equal(loc.source, 'env')
  assert.equal(D.instanceDataFile(), path.join(s.dir, 'custom/my-topology.json'))
})

test('TOPOLOGY_DATA_DIR 决定实例目录与版本目录', (t) => {
  const s = sandbox()
  t.after(() => s.restore())
  process.env.TOPOLOGY_DATA_DIR = 'store'
  assert.equal(D.instanceDataFile(), path.join(s.dir, 'store/topology.json'))
  assert.equal(D.versionsDir(), path.join(s.dir, 'store/versions'))
})

test('旧布局 src/data 仍可只读兼容', (t) => {
  const s = sandbox()
  t.after(() => s.restore())
  s.write('src/data/topology.json')
  const loc = D.resolveDataFile()
  assert.equal(loc.isDemo, false)
  assert.match(loc.file, /src\/data\/topology\.json$/)
  // 写入仍落到规范实例路径
  assert.equal(D.instanceDataFile(), path.join(s.dir, 'data/topology.json'))
})

test('显式指向仓库自带示例文件时仍标记为 demo（防止写回示例数据）', () => {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  try {
    delete process.env.TOPOLOGY_ROOT
    process.env.TOPOLOGY_DATA = 'examples/demo/topology.json'
    const loc = D.resolveDataFile()
    assert.equal(loc.isDemo, true)
    assert.equal(loc.source, 'demo')
  } finally {
    ENV_KEYS.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    })
  }
})

test('ensureWritableDataFile：文件不存在时从示例初始化', (t) => {
  const s = sandbox()
  t.after(() => s.restore())
  s.write('examples/demo/topology.json', '{"nodes":[{"id":"demo"}],"relations":[]}')
  const target = D.ensureWritableDataFile()
  assert.equal(target, path.join(s.dir, 'data/topology.json'))
  assert.ok(fs.existsSync(target))
  assert.match(fs.readFileSync(target, 'utf-8'), /demo/)
  // 幂等：已存在时不覆盖
  fs.writeFileSync(target, '{"nodes":[],"relations":[]}')
  D.ensureWritableDataFile()
  assert.equal(fs.readFileSync(target, 'utf-8'), '{"nodes":[],"relations":[]}')
})

test('ensureWritableDataFile：既无实例也无示例时报可读错误', (t) => {
  const s = sandbox()
  t.after(() => s.restore())
  assert.throws(() => D.ensureWritableDataFile(), /数据文件不存在/)
  assert.throws(() => D.requireDataFile(), /未找到拓扑数据/)
})
