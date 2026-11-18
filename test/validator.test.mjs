/**
 * 校验器测试（scripts/validate-topology.mjs —— CI 的阻断点）。
 *
 * 这里不打桩，直接拿示例数据当「合法基线」，逐项注入错误再跑子进程，
 * 验证：合法数据不误报、每类脏数据都能被拦住且给出可定位的提示。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const DEMO = path.join(ROOT, 'examples/demo/topology.json')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'topo-validator-test-'))

test.after(() => fs.rmSync(TMP, { recursive: true, force: true }))

const demo = () => JSON.parse(fs.readFileSync(DEMO, 'utf-8'))

/** 跑 CI 校验器，返回 {status, output} */
function runValidate(data, name) {
  const file = path.join(TMP, `${name}.json`)
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
  try {
    const out = execFileSync(
      process.execPath,
      ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'scripts/validate-topology.mjs'],
      {
        cwd: ROOT,
        env: { ...process.env, TOPOLOGY_DATA: file },
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    return { status: 0, output: out }
  } catch (e) {
    return { status: e.status, output: `${e.stdout || ''}${e.stderr || ''}` }
  }
}

test('合法示例数据：0 错误，且打印数据源（覆盖率断言）', () => {
  const r = runValidate(demo(), 'ok')
  assert.equal(r.status, 0)
  assert.match(r.output, /无致命错误/)
  assert.match(r.output, /数据源：/) // 不静默：告诉你校验的到底是哪份数据
  assert.match(r.output, /12 节点 \/ 16 关系/)
})

test('悬空关系：目标节点不存在 → 退出码 1', () => {
  const d = demo()
  d.relations[0].target = 'ghost-node'
  const r = runValidate(d, 'dangling')
  assert.equal(r.status, 1)
  assert.match(r.output, /悬空/)
})

test('非法枚举：关系类型不在值域 → 退出码 1', () => {
  const d = demo()
  d.relations[0].relationType = 'talks_to'
  const r = runValidate(d, 'bad-enum')
  assert.equal(r.status, 1)
  assert.match(r.output, /relationType 非法/)
})

test('词表外宿主引擎 → 退出码 1（词表数据化后的新约束）', () => {
  const d = demo()
  d.processCatalog.domains[0].groups[0].processes[0].host = 'unknown-engine'
  const r = runValidate(d, 'bad-host')
  assert.equal(r.status, 1)
  assert.match(r.output, /宿主引擎不在词表/)
})

test('词表外业务域 → 退出码 1', () => {
  const d = demo()
  d.businessFlows[0].domain = 'not-a-domain'
  const r = runValidate(d, 'bad-domain')
  assert.equal(r.status, 1)
  assert.match(r.output, /不在业务域词表/)
})

test('重复节点 id → 退出码 1', () => {
  const d = demo()
  d.nodes.push({ ...d.nodes[0] })
  const r = runValidate(d, 'dup-node')
  assert.equal(r.status, 1)
  assert.match(r.output, /id 重复/)
})

test('证据口径：refutes 但 confidence=high 只告警不阻断', () => {
  const d = demo()
  d.relations[0].evidence = { kind: 'code', verdict: 'refutes' }
  d.relations[0].confidence = 'high'
  const r = runValidate(d, 'refutes-high')
  assert.equal(r.status, 0)
  assert.match(r.output, /应降为 doubtful/)
})

test('读不到数据文件时给出可读报错（退出码非 0）', () => {
  let status = 0
  let out = ''
  try {
    execFileSync(
      process.execPath,
      ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'scripts/validate-topology.mjs'],
      {
        cwd: ROOT,
        env: { ...process.env, TOPOLOGY_DATA: path.join(TMP, 'does-not-exist.json') },
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
  } catch (e) {
    status = e.status
    out = `${e.stdout || ''}${e.stderr || ''}`
  }
  assert.notEqual(status, 0)
  assert.match(out, /未找到拓扑数据/)
})
