/**
 * 影响面传播测试（src/lib/impact.ts 是页面与 API 的唯一实现）。
 *
 * 锁住的口径：
 *   - 受影响集合 = 上游 ∪ 下游 ∪ 自身；
 *   - 深度受限（1..3）；
 *   - 链路可信度 = 路径最弱一环（一条 doubtful 边会拖垮整条结论）；
 *   - 环上有界，不会死循环。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const { computeImpact, normalizeDepth, MAX_IMPACT_DEPTH, DEFAULT_IMPACT_DEPTH, IMPACT_CAVEATS } = await import(
  pathToFileURL(path.join(ROOT, 'src/lib/impact.ts')).href
)

const node = (id) => ({ id, name: id, description: id, category: 'application', layer: 'application' })
const rel = (id, source, target, extra = {}) => ({
  id,
  source,
  target,
  relationType: 'calls',
  confidence: 'high',
  ...extra,
})

const data = {
  nodes: [node('web'), node('api'), node('db'), node('mq')],
  relations: [
    rel('r-web-api', 'web', 'api'),
    rel('r-api-db', 'api', 'db'),
    rel('r-api-mq', 'api', 'mq', { confidence: 'low' }),
  ],
  businessFlows: [
    {
      id: 'f1',
      name: '下单',
      description: '',
      domain: 'fin',
      steps: [
        { nodeId: 'web', label: '入口' },
        { nodeId: 'db', label: '落库' },
      ],
    },
    {
      id: 'f2',
      name: '无关流程',
      description: '',
      domain: 'hr',
      steps: [{ nodeId: 'other', label: '无关' }],
    },
  ],
  processCatalog: {
    domains: [
      {
        id: 'fin',
        name: '财务',
        groups: [
          {
            id: 'g1',
            name: '交易',
            processes: [{ id: 'p1', name: '下单流程', systems: ['mq'], flows: ['f1'], host: 'new' }],
          },
        ],
      },
    ],
    dependencies: [],
  },
}

test('基本传播：上下游各一层 + 自身', () => {
  const a = computeImpact(data, 'api', 1)
  assert.deepEqual(a.up.map((n) => n.id), ['web'])
  assert.deepEqual(a.down.map((n) => n.id).sort(), ['db', 'mq'])
  assert.equal(a.impactIds.size, 4)
  assert.equal(a.depth, 1)
})

test('深度受限：db 的上游按层展开', () => {
  const a = computeImpact(data, 'db', 2)
  const up = Object.fromEntries(a.up.map((n) => [n.id, n.depth]))
  assert.equal(up.api, 1)
  assert.equal(up.web, 2)
})

test('最弱一环：low 边会把下游结论降为 low，且记录最弱边 id', () => {
  const a = computeImpact(data, 'api', 1)
  const mq = a.down.find((n) => n.id === 'mq')
  const db = a.down.find((n) => n.id === 'db')
  assert.equal(mq.confidence, 'low')
  assert.equal(mq.weakestRelationId, 'r-api-mq')
  assert.equal(db.confidence, 'high')
  assert.deepEqual(a.trust, { high: 2, medium: 0, low: 1, doubtful: 0 })
})

test('缺省 confidence 视为 low（最保守），不冒充 high', () => {
  const d = {
    nodes: [node('a'), node('b')],
    relations: [{ id: 'r1', source: 'a', target: 'b', relationType: 'calls' }],
  }
  const a = computeImpact(d, 'a', 1)
  assert.equal(a.down[0].confidence, 'low')
})

test('环上有界：a↔b 不会死循环', () => {
  const d = {
    nodes: [node('a'), node('b'), node('c')],
    relations: [rel('r1', 'a', 'b'), rel('r2', 'b', 'a'), rel('r3', 'b', 'c')],
  }
  const a = computeImpact(d, 'a', MAX_IMPACT_DEPTH)
  assert.ok(a.impactIds.has('b'))
  assert.ok(a.impactIds.has('c'))
  assert.ok(a.up.length + a.down.length <= 3)
})

test('受影响业务流 / 流程按节点命中', () => {
  const a = computeImpact(data, 'api', 2)
  assert.deepEqual(a.affectedFlows.map((f) => f.id), ['f1'])
  assert.deepEqual(a.affectedProcesses.map((p) => p.id), ['p1'])
  assert.equal(a.affectedProcesses[0].domainId, 'fin')
})

test('normalizeDepth：字符串数字、越界、非法值', () => {
  assert.equal(normalizeDepth('3'), 3)
  assert.equal(normalizeDepth(99), MAX_IMPACT_DEPTH)
  assert.equal(normalizeDepth(0), 1)
  assert.equal(normalizeDepth('abc'), DEFAULT_IMPACT_DEPTH)
  assert.equal(normalizeDepth(null), DEFAULT_IMPACT_DEPTH)
  assert.ok(IMPACT_CAVEATS.length > 0)
})
