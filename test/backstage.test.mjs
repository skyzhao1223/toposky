/**
 * Backstage 目录互通测试（catalog-info.yaml ↔ topology.json）。
 *
 * 锁住的契约：
 *   - 导出的是合法 Backstage 实体（kind/apiVersion/metadata.name 齐全，实体名合法）；
 *   - System / Component / Resource / API / Group 五类都有且能对应回图谱；
 *   - 导入是「只补不覆盖」的幂等合并，且默认 dry-run；
 *   - 导入结果必须过 CI 校验器；
 *   - 指向示例数据时拒绝写入（避免把演示数据当实例数据改）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import yaml from 'js-yaml'

const ROOT = process.cwd()
const DEMO = path.join(ROOT, 'examples/demo/topology.json')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'topo-backstage-test-'))

test.after(() => fs.rmSync(TMP, { recursive: true, force: true }))

function run(args, dataFile) {
  const env = { ...process.env, TOPOLOGY_DATA: dataFile }
  try {
    const out = execFileSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'scripts/backstage.mjs', ...args], {
      cwd: ROOT,
      env,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, output: out }
  } catch (e) {
    return { status: e.status, output: `${e.stdout || ''}${e.stderr || ''}` }
  }
}

function emptyData(name) {
  const p = path.join(TMP, `${name}.json`)
  fs.writeFileSync(p, JSON.stringify({ nodes: [], relations: [] }, null, 2) + '\n')
  return p
}

test('导出：五类实体齐全、实体名合法、API 有提供方', () => {
  const out = path.join(TMP, 'export')
  const r = run(['export', '--out', out], DEMO)
  assert.equal(r.status, 0)
  assert.match(r.output, /示例数据/)

  const entities = yaml.loadAll(fs.readFileSync(path.join(out, 'catalog-info.yaml'), 'utf-8')).filter(Boolean)
  const kinds = entities.reduce((m, e) => ((m[e.kind] = (m[e.kind] || 0) + 1), m), {})
  assert.deepEqual(kinds, { Group: 5, System: 4, Component: 6, Resource: 6, API: 3 })

  for (const e of entities) {
    assert.equal(e.apiVersion, 'backstage.io/v1alpha1')
    assert.match(e.metadata.name, /^[a-z0-9][a-z0-9_.-]*$/i)
    assert.ok(e.metadata.name.length <= 63)
    assert.ok(e.spec && typeof e.spec === 'object')
  }
  // 每个 API 都有 Component 声明 providesApis（否则是悬空实体）
  const apis = entities.filter((e) => e.kind === 'API')
  apis.forEach((a) => {
    const provider = entities.find((e) => e.kind === 'Component' && (e.spec.providesApis || []).includes(a.metadata.name))
    assert.ok(provider, `API ${a.metadata.name} 没有提供方`)
  })
})

test('导出：Component 带 system / owner / 仓库链接 / dependsOn', () => {
  const out = path.join(TMP, 'export2')
  run(['export', '--out', out], DEMO)
  const entities = yaml.loadAll(fs.readFileSync(path.join(out, 'catalog-info.yaml'), 'utf-8')).filter(Boolean)
  const approval = entities.find((e) => e.kind === 'Component' && e.metadata.name === 'approval-api')
  assert.equal(approval.spec.system, 'approval')
  assert.match(approval.spec.owner, /^team-\d+$/)
  assert.equal(approval.metadata.annotations['toposky/id'], 'approval-api')
  assert.ok((approval.metadata.links || []).some((l) => /repo|仓库|git/i.test(l.title) || /\.git$/.test(l.url)))
  assert.ok(approval.spec.dependsOn.includes('resource:mysql'))
  assert.ok(approval.spec.providesApis.length === 1)
})

test('导入：round-trip 数量一致、证据标注为文档且未核实、结果通过校验', () => {
  const out = path.join(TMP, 'rt-export')
  run(['export', '--out', out], DEMO)
  const data = emptyData('rt-data')
  const r = run(['import', '--file', out, '--apply'], data)
  assert.equal(r.status, 0, r.output)
  assert.match(r.output, /系统 4 · 节点 12 · 关系 16/)

  const d = JSON.parse(fs.readFileSync(data, 'utf-8'))
  assert.equal(d.systems.length, 4)
  assert.equal(d.nodes.length, 12)
  assert.equal(d.relations.length, 16)
  // 团队名从 Group 还原为中文，不是 team-N
  assert.ok(d.nodes.every((n) => !n.owner || !/^team-\d+$/.test(n.owner)))
  // 仓库链接保留
  assert.equal(d.nodes.find((n) => n.id === 'approval-api').links.repo, 'https://example.com/acme/approval-api')
  // 证据纪律：文档来源、无 verdict（没核实过就不能假装核实）
  d.relations.forEach((rel) => {
    assert.equal(rel.evidence.kind, 'doc')
    assert.equal(rel.evidence.verdict, undefined)
    assert.ok(['calls', 'depends_on'].includes(rel.relationType))
  })

  // 导入结果必须过 CI 校验器
  const v = execFileSync(
    process.execPath,
    ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'scripts/validate-topology.mjs'],
    { cwd: ROOT, env: { ...process.env, TOPOLOGY_DATA: data }, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  assert.match(v, /无致命错误/)
})

test('导入：幂等（再导一次 0 新增）且不覆盖已有字段', () => {
  const out = path.join(TMP, 'idem-export')
  run(['export', '--out', out], DEMO)
  const data = emptyData('idem-data')
  run(['import', '--file', out, '--apply'], data)

  // 人为改一个字段，验证「只补空、不覆盖」
  const before = JSON.parse(fs.readFileSync(data, 'utf-8'))
  before.nodes.find((n) => n.id === 'approval-api').name = '人工改名'
  fs.writeFileSync(data, JSON.stringify(before, null, 2))

  const r = run(['import', '--file', out, '--apply'], data)
  assert.match(r.output, /系统 0 · 节点 0 · 关系 0/)
  const after = JSON.parse(fs.readFileSync(data, 'utf-8'))
  assert.equal(after.nodes.find((n) => n.id === 'approval-api').name, '人工改名')
})

test('导入：默认 dry-run 不落盘', () => {
  const out = path.join(TMP, 'dry-export')
  run(['export', '--out', out], DEMO)
  const data = emptyData('dry-data')
  const before = fs.readFileSync(data, 'utf-8')
  const r = run(['import', '--file', out], data)
  assert.equal(r.status, 0)
  assert.match(r.output, /dry-run/)
  assert.equal(fs.readFileSync(data, 'utf-8'), before)
})

test('导入：拒绝写入示例数据', () => {
  const out = path.join(TMP, 'refuse-export')
  run(['export', '--out', out], DEMO)
  const r = run(['import', '--file', out, '--apply'], DEMO)
  assert.notEqual(r.status, 0)
  assert.match(r.output, /拒绝写入/)
  // 示例文件未被改动
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(DEMO, 'utf-8')))
})

test('导入：映射不上时不猜（进未解析清单）', () => {
  const yamlFile = path.join(TMP, 'partial.yaml')
  fs.writeFileSync(
    yamlFile,
    [
      'apiVersion: backstage.io/v1alpha1',
      'kind: Component',
      'metadata:',
      '  name: demo-api',
      '  title: 演示服务',
      'spec:',
      '  type: service',
      '  lifecycle: production',
      '  owner: team-1',
      '  dependsOn:',
      '    - component:ghost-service',
    ].join('\n'),
  )
  const data = emptyData('partial-data')
  const r = run(['import', '--file', yamlFile], data)
  assert.equal(r.status, 0)
  assert.match(r.output, /无法映射/)
  assert.match(r.output, /ghost-service/)
})
