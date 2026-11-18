import type { ElkNode } from 'elkjs/lib/elk.bundled.js'

export interface ElkPoint {
  x: number
  y: number
}

export interface ElkLayoutNode {
  id: string
  x: number
  y: number
}

export interface ElkLayoutEdge {
  id: string
  points: ElkPoint[]
}

export interface ElkLayoutResult {
  nodes: ElkLayoutNode[]
  edges: ElkLayoutEdge[]
}

export interface ElkLayeredOptions {
  ids: string[]
  edges: { id: string; source: string; target: string }[]
  width: number
  height: number
  direction?: 'DOWN' | 'RIGHT'
  /** 每个节点所属分区（用于按架构分层成带）；不传则纯按依赖分层 */
  partitions?: Record<string, number>
  spacing?: { nodeNode?: number; edgeEdge?: number; edgeNode?: number; rank?: number }
}

/**
 * 用 ELK 做分层布局 + 正交布线（交叉最小化 / 拐点优化 / 边间距分离）。
 * 动态导入 elkjs，避免在 SSR 阶段求值。
 */
export async function elkLayered(opts: ElkLayeredOptions): Promise<ElkLayoutResult> {
  const { ids, edges, width, height, direction = 'DOWN', partitions, spacing = {} } = opts
  const ELK = (await import('elkjs/lib/elk.bundled.js')).default
  const elk = new ELK()

  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.cycleBreaking.strategy': 'GREEDY',
      'elk.spacing.nodeNode': String(spacing.nodeNode ?? 30),
      'elk.spacing.edgeEdge': String(spacing.edgeEdge ?? 18),
      'elk.layered.spacing.edgeNodeBetweenLayers': String(spacing.edgeNode ?? 24),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(spacing.rank ?? 74),
      ...(partitions ? { 'elk.partitioning.activate': 'true' } : {}),
    },
    children: ids.map((id) => ({
      id,
      width,
      height,
      ...(partitions ? { layoutOptions: { 'elk.partitioning.partition': String(partitions[id] ?? 0) } } : {}),
    })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  }

  const res = (await elk.layout(graph as unknown as ElkNode)) as unknown as {
    children?: { id: string; x?: number; y?: number }[]
    edges?: {
      id: string
      sections?: { startPoint: ElkPoint; bendPoints?: ElkPoint[]; endPoint: ElkPoint }[]
    }[]
  }

  const nodes: ElkLayoutNode[] = (res.children ?? []).map((c) => ({ id: c.id, x: c.x ?? 0, y: c.y ?? 0 }))
  const routedEdges: ElkLayoutEdge[] = (res.edges ?? []).map((e) => {
    const pts: ElkPoint[] = []
    const sec = e.sections?.[0]
    if (sec) {
      pts.push(sec.startPoint)
      ;(sec.bendPoints ?? []).forEach((b) => pts.push(b))
      pts.push(sec.endPoint)
    }
    return { id: e.id, points: pts }
  })

  return { nodes, edges: routedEdges }
}
