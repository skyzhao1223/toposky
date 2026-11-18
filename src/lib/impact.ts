/**
 * 影响面计算 —— 单一实现。
 *
 * 口径（与 /impact 页面、/api/impact 一致）：
 *   **受影响集合 = 上游 ∪ 下游 ∪ 自身**，沿依赖图双向传播，深度受限（depth 层）。
 *
 * 本模块刻意保持纯计算、零运行时依赖（只用 type-only import），因此可被三处共用：
 *   1. 页面：src/app/impact/page.tsx
 *   2. 服务端：src/app/api/impact/route.ts（供内部/外部/后续 MCP 工具调用）
 *   3. 一致性校验：scripts/check-impact-parity.mjs（Node 原生跑 .ts，无需额外依赖）
 *
 * 本模块是影响面的唯一实现，避免多处口径漂移。
 */
import type { BusinessFlow, ProcessHost, RelationConfidence, SystemNode, TopologyData } from '../types'

/** 传播深度上限（与页面选择器一致） */
export const MAX_IMPACT_DEPTH = 3
export const DEFAULT_IMPACT_DEPTH = 2

/** 影响面口径说明（对外输出时一并返回，避免误读为代码级结论） */
export const IMPACT_CAVEATS = [
  '元数据图谱级口径：受影响 = 业务流程路径触及了受影响系统，不等于该变更必然导致其故障。',
  '节点粒度为「系统/服务」，边为调用/依赖/消息等粗粒度关系，不含接口字段与条件分支。',
  '结论用于圈定范围、通知团队、初筛回归；精确定位请结合变更 diff、接口契约与测试用例。',
  '每条传播路径带「最弱一环」可信度：只要链路上有一条 low/doubtful 的依赖，该条结论就只能当线索，不可对外承诺。',
]

export function normalizeDepth(input: unknown, fallback = DEFAULT_IMPACT_DEPTH): number {
  // 显式传 null/'' 是「没传」（URLSearchParams.get 缺参返回 null），应走默认值而不是被 Number(null)=0 截成 1
  if (input === null || input === undefined || input === '') return fallback
  const n = typeof input === 'number' ? input : Number(input)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.trunc(n), 1), MAX_IMPACT_DEPTH)
}

export interface ImpactNode {
  id: string
  /** 距分析对象的层级距离（1 = 直接相邻） */
  depth: number
  /** 传播路径上的关系标签 */
  via: string[]
  /**
   * 传播路径上**最弱一环**的证据强度。
   * 一条链路的可信度取决于它最弱的那条边 —— 只要经过一条 doubtful，整条结论就不可承诺。
   */
  confidence: RelationConfidence
  /** 路径最弱一环对应的关系 id（供界面回查「凭什么」，见 src/lib/evidence.ts） */
  weakestRelationId?: string
}

/** 可信度分层：按「路径最弱一环」统计受影响范围 */
export interface TrustBreakdown {
  high: number
  medium: number
  low: number
  doubtful: number
}

const CONF_RANK: Record<RelationConfidence, number> = { doubtful: 0, low: 1, medium: 2, high: 3 }
/** 取两者中更弱的一个 */
const weaker = (a: RelationConfidence, b: RelationConfidence): RelationConfidence =>
  CONF_RANK[a] <= CONF_RANK[b] ? a : b

export interface AffectedProcess {
  id: string
  name: string
  domainId: string
  groupName: string
  host?: ProcessHost
}

export interface ImpactAnalysis {
  focusId: string
  depth: number
  up: ImpactNode[]
  down: ImpactNode[]
  /** 上游 ∪ 下游 ∪ 自身 */
  impactIds: Set<string>
  affectedFlows: BusinessFlow[]
  affectedProcesses: AffectedProcess[]
  /** 可信度分层（按路径最弱一环） */
  trust: TrustBreakdown
}

/**
 * 计算影响面。算法与页面原实现逐行等价（BFS + 先到先得，不覆盖已访问节点）。
 */
export function computeImpact(data: TopologyData, focusId: string, depth: unknown = DEFAULT_IMPACT_DEPTH): ImpactAnalysis {
  const d = normalizeDepth(depth)
  const relations = data.relations || []

  const up = new Map<string, { depth: number; via: string[]; confidence: RelationConfidence; relId: string }>()
  const down = new Map<string, { depth: number; via: string[]; confidence: RelationConfidence; relId: string }>()

  const qUp: string[] = [focusId]
  up.set(focusId, { depth: 0, via: [], confidence: 'high', relId: '' })
  while (qUp.length > 0) {
    const cur = qUp.shift() as string
    const curD = up.get(cur)!.depth
    if (curD >= d) continue
    relations.forEach((r) => {
      if (r.target === cur && !up.has(r.source)) {
        const curConf = up.get(cur)!.confidence
        const edgeConf = r.confidence || 'low'
        up.set(r.source, {
          depth: curD + 1,
          via: [...up.get(cur)!.via, r.label || r.relationType],
          confidence: weaker(curConf, edgeConf),
          // 链路最弱一环落在哪条边上：边比已有链路更弱（或并列）时记这条边
          relId: CONF_RANK[edgeConf] <= CONF_RANK[curConf] ? r.id : up.get(cur)!.relId,
        })
        qUp.push(r.source)
      }
    })
  }

  const qDown: string[] = [focusId]
  down.set(focusId, { depth: 0, via: [], confidence: 'high', relId: '' })
  while (qDown.length > 0) {
    const cur = qDown.shift() as string
    const curD = down.get(cur)!.depth
    if (curD >= d) continue
    relations.forEach((r) => {
      if (r.source === cur && !down.has(r.target)) {
        const curConf = down.get(cur)!.confidence
        const edgeConf = r.confidence || 'low'
        down.set(r.target, {
          depth: curD + 1,
          via: [...down.get(cur)!.via, r.label || r.relationType],
          confidence: weaker(curConf, edgeConf),
          relId: CONF_RANK[edgeConf] <= CONF_RANK[curConf] ? r.id : down.get(cur)!.relId,
        })
        qDown.push(r.target)
      }
    })
  }

  const impactIds = new Set<string>([focusId, ...up.keys(), ...down.keys()])

  const affectedFlows = (data.businessFlows || []).filter((f) =>
    f.steps.some((s) => impactIds.has(s.nodeId)),
  )

  const affectedProcesses: AffectedProcess[] = []
  data.processCatalog?.domains.forEach((dom) =>
    dom.groups.forEach((g) =>
      g.processes.forEach((p) => {
        const hit = (p.systems || []).some((sid) => impactIds.has(sid))
        if (hit) affectedProcesses.push({ id: p.id, name: p.name, domainId: dom.id, groupName: g.name, host: p.host })
      }),
    ),
  )

  const toList = (
    m: Map<string, { depth: number; via: string[]; confidence: RelationConfidence; relId: string }>,
  ): ImpactNode[] =>
    Array.from(m.entries())
      .filter(([id]) => id !== focusId)
      .map(([id, v]) => ({
        id,
        depth: v.depth,
        via: v.via,
        confidence: v.confidence,
        weakestRelationId: v.relId || undefined,
      }))

  const listUp = toList(up)
  const listDown = toList(down)
  const trust: TrustBreakdown = { high: 0, medium: 0, low: 0, doubtful: 0 }
  ;[...listUp, ...listDown].forEach((n) => {
    trust[n.confidence] += 1
  })

  return { focusId, depth: d, up: listUp, down: listDown, impactIds, affectedFlows, affectedProcesses, trust }
}

/** 受影响范围涉及的负责人（按系统数降序） */
export function collectOwners(data: TopologyData, impactIds: Set<string>): { owner: string; count: number }[] {
  const counts = new Map<string, number>()
  impactIds.forEach((id) => {
    const owner = data.nodes.find((n) => n.id === id)?.owner
    if (owner) counts.set(owner, (counts.get(owner) || 0) + 1)
  })
  return Array.from(counts.entries())
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count)
}

/** 受影响范围涉及的代码仓库（按系统数降序） */
export function collectRepos(data: TopologyData, impactIds: Set<string>): { repo: string; count: number; systems: { id: string; name: string }[] }[] {
  const map = new Map<string, { id: string; name: string }[]>()
  impactIds.forEach((id) => {
    const node = data.nodes.find((n) => n.id === id)
    const repo = node?.links?.repo
    if (!node || !repo) return
    if (!map.has(repo)) map.set(repo, [])
    map.get(repo)!.push({ id: node.id, name: node.name })
  })
  return Array.from(map.entries())
    .map(([repo, systems]) => ({ repo, count: systems.length, systems }))
    .sort((a, b) => b.count - a.count)
}

/** 分析对象的直接依赖契约（接口/topic/表） */
export function collectContracts(data: TopologyData, focusId: string) {
  const nameOf = (id: string): string => data.nodes.find((n) => n.id === id)?.name || id
  return (data.relations || [])
    .filter((r) => r.source === focusId || r.target === focusId)
    .map((r) => ({
      direction: r.source === focusId ? 'out' : 'in',
      from: { id: r.source, name: nameOf(r.source) },
      to: { id: r.target, name: nameOf(r.target) },
      relation: r.label || r.relationType,
      contract: r.contract ?? null,
    }))
}

/** 摘要数字 */
export function summarizeImpact(data: TopologyData, analysis: ImpactAnalysis) {
  return {
    upstream: analysis.up.length,
    downstream: analysis.down.length,
    total: analysis.impactIds.size - 1,
    businessFlows: analysis.affectedFlows.length,
    processes: analysis.affectedProcesses.length,
    repos: collectRepos(data, analysis.impactIds).length,
    owners: collectOwners(data, analysis.impactIds).length,
    contracts: collectContracts(data, analysis.focusId).length,
    // 可信度分层：一次影响分析里，哪些结论建立在强证据上、哪些只是线索
    trust: analysis.trust,
    /** 结论可直接承诺的条数（路径全程 high） */
    trustCommittable: analysis.trust.high,
    /** 结论仅可作线索的条数（路径含 low/doubtful） */
    trustIndicative: analysis.trust.low + analysis.trust.doubtful,
  }
}

/** 节点快照（供 API/MCP 输出，避免调用方再查一次） */
export function nodeRef(data: TopologyData, id: string): { id: string; name: string; layer?: string; businessLine?: string; owner?: string } {
  const n: SystemNode | undefined = data.nodes.find((x) => x.id === id)
  return { id, name: n?.name || id, layer: n?.layer, businessLine: n?.businessLine, owner: n?.owner }
}
