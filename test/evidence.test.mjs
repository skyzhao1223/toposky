/**
 * 证据口径测试。
 *
 * 锁住的语义（来自 AGENTS.md 第二节，都是踩过的坑）：
 *   - 「填了 evidence」≠「核实过」：必须有 verdict；
 *   - absent（按该来源没搜到）≠ refutes（有反证）——性质完全不同；
 *   - 可承诺 = high + supports；
 *   - 需复核 = doubtful / absent / refutes。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const { describeEvidence, evidenceSummary, EVIDENCE_CAVEAT } = await import(
  pathToFileURL(path.join(ROOT, 'src/lib/evidence.ts')).href
)

const rel = (id, extra) => ({ id, source: 'a', target: 'b', relationType: 'calls', ...extra })

test('describeEvidence：有来源但没核实 ≠ 核实过', () => {
  const v = describeEvidence(rel('r1', { confidence: 'high', evidence: { kind: 'code', ref: 'x.ts:1' } }))
  assert.equal(v.verified, false)
  assert.equal(v.committable, false)
  assert.match(v.headline, /未核实/)
})

test('describeEvidence：high + supports 才算可承诺', () => {
  const v = describeEvidence(
    rel('r2', { confidence: 'high', evidence: { kind: 'code', ref: 'x.ts:1', verdict: 'supports' } }),
  )
  assert.equal(v.verified, true)
  assert.equal(v.committable, true)
  assert.match(v.headline, /核实通过/)
})

test('describeEvidence：absent 与 refutes 都要复核，但结论语义不同', () => {
  const absent = describeEvidence(rel('r3', { confidence: 'doubtful', evidence: { kind: 'code', verdict: 'absent' } }))
  const refutes = describeEvidence(rel('r4', { confidence: 'doubtful', evidence: { kind: 'code', verdict: 'refutes' } }))
  assert.equal(absent.needsReview, true)
  assert.equal(refutes.needsReview, true)
  assert.match(absent.headline, /未检索到证据/)
  assert.match(refutes.headline, /有反证/)
  assert.notEqual(absent.headline, refutes.headline)
})

test('evidenceSummary：分层统计与「在等什么数据」', () => {
  const relations = [
    rel('r1', { confidence: 'high', evidence: { kind: 'code', verdict: 'supports' } }),
    rel('r2', { confidence: 'low', evidence: { kind: 'doc', verdict: 'weak' } }),
    rel('r3', {
      confidence: 'doubtful',
      evidence: { kind: 'config', verdict: 'absent', pendingData: 'P0-gateway' },
    }),
    rel('r4', { confidence: 'doubtful', evidence: { kind: 'inference', verdict: 'refutes' } }),
  ]
  const s = evidenceSummary(relations)
  assert.equal(s.total, 4)
  assert.equal(s.withSource, 4)
  assert.equal(s.verified, 4)
  assert.equal(s.committable, 1)
  assert.equal(s.needsReview, 2)
  assert.equal(s.byVerdict.supports, 1)
  assert.equal(s.byVerdict.absent, 1)
  assert.equal(s.byVerdict.refutes, 1)
  assert.equal(s.byPending['P0-gateway'], 1)
  assert.equal(s.byPending.manual, 1) // 有反证但没写 pendingData → 归 manual
  assert.equal(s.verdictButDoubtful, 0)
})

test('evidenceSummary：supports 但 confidence=doubtful 会被单独计数（口径冲突）', () => {
  const s = evidenceSummary([
    rel('r1', { confidence: 'doubtful', evidence: { kind: 'code', verdict: 'supports' } }),
  ])
  assert.equal(s.verdictButDoubtful, 1)
  assert.equal(s.committable, 0)
})

test('口径说明常量为非空字符串（供界面与报告统一引用）', () => {
  assert.ok(typeof EVIDENCE_CAVEAT === 'string' && EVIDENCE_CAVEAT.length > 10)
})
