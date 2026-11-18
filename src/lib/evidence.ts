/**
 * 证据链的对外口径 —— 单一实现。
 *
 * 回答一个问题：**这条依赖凭什么成立？**
 *   来源类型（evidence.kind）+ 可定位出处（evidence.ref）+ 核实结论（evidence.verdict）
 *
 * 设计约束（与 src/lib/impact.ts 一致）：
 *   只用 type-only import，因此可被页面、/api 与 Node 原生脚本共用
 *   （Node 原生跑 .ts 时不解析相对路径的运行时导入）。
 *   界面标签（CONFIDENCE_LABELS 等）留在 @/types；本文件只负责**句子级口径**，
 *   避免各页面各写一套说法。
 *
 * 口径要点（勿踩，来自 AGENTS.md 第二节）：
 *   1. 「填了 evidence 字段」≠「核实过」：后者要求有 `verdict`。
 *   2. `absent`（按此方法没搜到，可能方法不对）≠ `refutes`（找到反证，才是结论）。
 *   3. `supports` 也不等于可对外承诺 —— 是否可用还取决于 `confidence`，见 confidenceUsage。
 *   4. 反证只来自人工标注或 `contract.note`，绝不从 `evidence.note` 取。
 */
import type {
  EvidenceKind,
  EvidenceVerdict,
  PendingData,
  RelationConfidence,
  SystemRelation,
} from '../types'

const CONFIDENCE_TEXT: Record<RelationConfidence, string> = {
  high: '高',
  medium: '中',
  low: '低',
  doubtful: '存疑',
}

const KIND_TEXT: Record<EvidenceKind, string> = {
  code: '代码',
  config: '配置',
  gateway: '网关路由',
  nacos: 'Nacos 实证',
  ledger: '台账',
  doc: '文档',
  inference: '推断',
}

const VERDICT_TEXT: Record<EvidenceVerdict, string> = {
  supports: '有依据',
  weak: '弱依据',
  absent: '无证据（待查）',
  refutes: '有反证（应删/降级）',
}

/** 关系用途口径（与 AGENTS.md 第四节一致） */
export function confidenceUsage(c: RelationConfidence): string {
  switch (c) {
    case 'high':
      return '可用于变更决策与对外承诺'
    case 'medium':
      return '可用于圈定范围、通知团队'
    case 'low':
      return '仅用于决定去哪查'
    default:
      return '不可用于对外承诺，需复核'
  }
}

export const EVIDENCE_CAVEAT =
  '「填了 evidence 字段」≠「核实过」（后者要求有 verdict）；absent 只代表「按该来源没搜到」，不等于不存在；refutes 才是「有反证」。'

export interface EvidenceView {
  confidence: RelationConfidence
  confidenceLabel: string
  /** 是否做过核实（有 verdict） */
  verified: boolean
  kind?: EvidenceKind
  kindLabel?: string
  ref?: string
  note?: string
  verdict?: EvidenceVerdict
  verdictLabel?: string
  /** 本机核实不了时，缺的是哪类外部数据（标签见 @/types 的 PENDING_DATA_LABELS） */
  pendingData?: PendingData
  /** 一句话结论（给人看，含出处） */
  headline: string
  /** 是否可用于变更决策 / 对外承诺（high + 已核实 + supports） */
  committable: boolean
  /** 是否需人工复核（doubtful / absent / refutes） */
  needsReview: boolean
}

/** 把一条关系的证据描述成「给人看的一句话」 */
export function describeEvidence(rel: SystemRelation): EvidenceView {
  // 缺省可信度视为「未评估」→ 按最保守口径呈现
  const c: RelationConfidence = rel.confidence || 'doubtful'
  const ev = rel.evidence
  const verdict = ev?.verdict
  const verified = Boolean(verdict)
  const where = ev?.ref ? `（${ev.ref}）` : ''
  const kindText = ev ? KIND_TEXT[ev.kind] ?? ev.kind : ''

  let headline: string
  if (!ev) headline = '无证据来源，未核实'
  else if (!verdict) headline = `仅有来源标注（${kindText}），未核实`
  else if (verdict === 'supports') headline = `${kindText}核实通过${where}`
  else if (verdict === 'weak') headline = `证据偏弱${where}`
  else if (verdict === 'absent') headline = `按该来源未检索到证据（待查，不等于不存在）${where}`
  else headline = `有反证，应删或降级${where}`

  return {
    confidence: c,
    confidenceLabel: CONFIDENCE_TEXT[c],
    verified,
    kind: ev?.kind,
    kindLabel: ev?.kind ? KIND_TEXT[ev.kind] ?? ev.kind : undefined,
    ref: ev?.ref,
    note: ev?.note,
    verdict,
    verdictLabel: verdict ? VERDICT_TEXT[verdict] : undefined,
    pendingData: ev?.pendingData,
    headline,
    committable: c === 'high' && verdict === 'supports',
    needsReview: c === 'doubtful' || verdict === 'absent' || verdict === 'refutes',
  }
}

export interface EvidenceSummary {
  total: number
  /** 有来源标注（有 evidence.kind） */
  withSource: number
  /** 真正核实过（有 verdict） */
  verified: number
  /** 只有来源标注、未核实 */
  unverified: number
  byVerdict: Record<EvidenceVerdict, number>
  byKind: Record<string, number>
  /** 可用于变更决策 / 对外承诺 */
  committable: number
  /** 需人工复核（doubtful / absent / refutes） */
  needsReview: number
  /** 口径冲突：有 verdict=supports 但 confidence 仍为 doubtful */
  verdictButDoubtful: number
  /** 需复核的边「在等什么数据」（P0-gateway / external-config / manual） */
  byPending: Record<string, number>
}

/** 汇总一批关系的证据覆盖情况（写进报告、校验提醒都用它，避免口径漂移） */
export function evidenceSummary(relations: SystemRelation[]): EvidenceSummary {
  const byVerdict: Record<EvidenceVerdict, number> = { supports: 0, weak: 0, absent: 0, refutes: 0 }
  const byKind: Record<string, number> = {}
  let withSource = 0
  let verified = 0
  let committable = 0
  let needsReview = 0
  let verdictButDoubtful = 0
  const byPending: Record<string, number> = {}
  for (const r of relations) {
    const v = describeEvidence(r)
    if (r.evidence?.kind) {
      withSource += 1
      byKind[r.evidence.kind] = (byKind[r.evidence.kind] || 0) + 1
    }
    if (v.verified) {
      verified += 1
      byVerdict[v.verdict as EvidenceVerdict] += 1
    }
    if (v.committable) committable += 1
    if (v.needsReview) {
      needsReview += 1
      const k = v.pendingData || 'manual'
      byPending[k] = (byPending[k] || 0) + 1
    }
    if (v.verdict === 'supports' && v.confidence === 'doubtful') verdictButDoubtful += 1
  }
  return {
    total: relations.length,
    withSource,
    verified,
    unverified: relations.length - verified,
    byVerdict,
    byKind,
    committable,
    needsReview,
    verdictButDoubtful,
    byPending,
  }
}
