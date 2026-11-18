import type { Node } from '@xyflow/react'
import {
  SystemNode,
  SystemRelation,
  SystemLayer,
  TopologyData,
  LAYER_LABELS,
  LAYER_COLORS,
  LAYER_ORDER,
  nodeLayer,
  nodePrimaryDomain,
  buildBusinessLineMaps,
  buildDomainMaps,
} from '@/types'

const COL_WIDTH = 160
const ROW_HEIGHT = 70
const MAX_COLS = 10
const CLUSTER_PADDING = 30
const CLUSTER_GAP = 60

function toNodeData(n: SystemNode) {
  return { name: n.name, description: n.description, layer: nodeLayer(n), owner: n.owner }
}

interface ClusterOpts {
  borderStyle?: 'dashed' | 'solid'
  bgOpacity?: string
  variant?: string
  borderWidth?: number
}

function makeClusterNode(
  id: string, x: number, y: number, w: number, h: number,
  label: string, color: string, opts: ClusterOpts = {},
): Node {
  const { borderStyle = 'dashed', bgOpacity = '08', variant, borderWidth = 2 } = opts
  return {
    id,
    type: 'cluster',
    position: { x, y },
    style: {
      width: w,
      height: h,
      backgroundColor: `${color}${bgOpacity}`,
      border: `${borderWidth}px ${borderStyle} ${color}${borderStyle === 'solid' ? '30' : '40'}`,
      borderRadius: 12,
    },
    data: { label, color, headerBg: `${color}18`, variant },
  }
}

function makeMoreButton(
  id: string, x: number, y: number,
  groupKey: string, isExpanded: boolean, hiddenCount: number,
): Node {
  return {
    id,
    type: 'system',
    position: { x, y },
    data: {
      name: isExpanded ? '收起 ↑' : `+${hiddenCount} 更多...`,
      description: isExpanded ? '点击收起' : '点击展开',
      isMoreButton: true,
      groupKey,
      isCollapse: isExpanded,
    },
  }
}

export function topoSortGroup(nodes: SystemNode[], relations: SystemRelation[]): SystemNode[] {
  const nodeIds = new Set(nodes.map((n) => n.id))
  const internalEdges = relations.filter((r) => nodeIds.has(r.source) && nodeIds.has(r.target))
  if (internalEdges.length === 0) return nodes

  const inDegree: Record<string, number> = {}
  const adj: Record<string, string[]> = {}
  nodes.forEach((n) => { inDegree[n.id] = 0; adj[n.id] = [] })
  internalEdges.forEach((e) => { adj[e.source].push(e.target); inDegree[e.target]++ })

  const queue: string[] = nodes.filter((n) => inDegree[n.id] === 0).map((n) => n.id)
  const sorted: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    sorted.push(id)
    for (const next of adj[id]) {
      if (--inDegree[next] === 0) queue.push(next)
    }
  }

  const sortedSet = new Set(sorted)
  nodes.forEach((n) => { if (!sortedSet.has(n.id)) sorted.push(n.id) })

  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  return sorted.map((id) => nodeMap.get(id)!).filter(Boolean)
}

export function flatLayout(nodes: SystemNode[]): Node[] {
  const layerGroups: Record<string, SystemNode[]> = {}
  nodes.forEach((n) => {
    const key = nodeLayer(n) || 'application'
    ;(layerGroups[key] ??= []).push(n)
  })

  const result: Node[] = []
  let currentY = 0

  LAYER_ORDER.forEach((layer) => {
    const group = layerGroups[layer]
    if (!group) return
    const cols = Math.min(group.length, MAX_COLS)
    const rows = Math.ceil(group.length / cols)
    const startX = -(cols * COL_WIDTH) / 2

    group.forEach((node, i) => {
      result.push({
        id: node.id,
        type: 'system',
        position: node.position || {
          x: startX + (i % cols) * COL_WIDTH,
          y: currentY + Math.floor(i / cols) * ROW_HEIGHT,
        },
        data: toNodeData(node),
      })
    })
    currentY += rows * ROW_HEIGHT + 50
  })

  return result
}

function resolveGroupMeta(groupBy: 'layer' | 'owner', key: string) {
  if (groupBy === 'layer') {
    return {
      label: LAYER_LABELS[key as SystemLayer] || key,
      color: LAYER_COLORS[key as SystemLayer] || '#8c8c8c',
    }
  }
  return { label: key, color: '#8c8c8c' }
}

export function clusterLayout(
  nodes: SystemNode[],
  groupBy: 'layer' | 'owner',
  relations?: SystemRelation[],
  expandedGroups?: Set<string>,
): Node[] {
  const groups: Record<string, SystemNode[]> = {}
  nodes.forEach((n) => {
    const key = groupBy === 'layer' ? (nodeLayer(n) || 'application') : (n.owner || '未分配')
    ;(groups[key] ??= []).push(n)
  })

  const result: Node[] = []
  let currentY = 0
  const groupOrder = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length)

  groupOrder.forEach((key) => {
    const sorted = topoSortGroup(groups[key], relations || [])
    const isExpanded = expandedGroups?.has(key)
    const canCollapse = sorted.length > 8
    const visibleNodes = !canCollapse || isExpanded ? sorted : sorted.slice(0, 7)
    const hiddenCount = sorted.length - visibleNodes.length
    const hasActionBtn = canCollapse

    const cols = Math.min(visibleNodes.length + (hasActionBtn ? 1 : 0), 8)
    const totalItems = visibleNodes.length + (hasActionBtn ? 1 : 0)
    const rows = Math.ceil(totalItems / cols)
    const groupWidth = cols * COL_WIDTH + CLUSTER_PADDING * 2
    const groupHeight = rows * ROW_HEIGHT + CLUSTER_PADDING * 2 + 40
    const startX = -groupWidth / 2 + CLUSTER_PADDING

    const { label: rawLabel, color } = resolveGroupMeta(groupBy, key)
    const label = isExpanded ? rawLabel : `${rawLabel} (${sorted.length})`

    result.push(makeClusterNode(`cluster-${key}`, -groupWidth / 2, currentY, groupWidth, groupHeight, label, color))

    visibleNodes.forEach((node, i) => {
      result.push({
        id: node.id,
        type: 'system',
        position: { x: startX + (i % cols) * COL_WIDTH, y: currentY + 40 + CLUSTER_PADDING + Math.floor(i / cols) * ROW_HEIGHT },
        data: toNodeData(node),
      })
    })

    if (hasActionBtn) {
      const idx = visibleNodes.length
      result.push(makeMoreButton(
        `more-${key}`,
        startX + (idx % cols) * COL_WIDTH,
        currentY + 40 + CLUSTER_PADDING + Math.floor(idx / cols) * ROW_HEIGHT,
        key, !!isExpanded, hiddenCount,
      ))
    }

    currentY += groupHeight + CLUSTER_GAP
  })

  return result
}

// ─── Architecture Matrix Layout ───

type ArchTier = SystemLayer

function classifyTier(n: SystemNode): ArchTier {
  // layer 为 SSOT；缺失时按 category 兜底（nodeLayer）
  const layer = nodeLayer(n)
  return layer && LAYER_ORDER.includes(layer) ? layer : 'application'
}

function inferExternalColumn(
  nodeId: string,
  relations: SystemRelation[],
  nodeMap: Map<string, SystemNode>,
): string | null {
  const callerLines: Record<string, number> = {}
  relations.forEach((r) => {
    if (r.target !== nodeId) return
    const caller = nodeMap.get(r.source)
    if (!caller?.businessLine || caller.businessLine === 'external') return
    callerLines[caller.businessLine] = (callerLines[caller.businessLine] || 0) + 1
  })
  const entries = Object.entries(callerLines)
  if (entries.length === 0) return null
  entries.sort((a, b) => b[1] - a[1])
  return entries[0][0]
}

const ARCH_NODE_W = 130
const ARCH_NODE_H = 44
const ARCH_NODE_GAP = 6
const ARCH_CELL_PAD = 8
const ARCH_TIER_GAP = 10
const ARCH_COL_GAP = 6
const ARCH_TIER_LABEL_W = 80
const ARCH_COL_HDR_H = 26
const ARCH_GRP_HDR_H = 24
const ARCH_GRP_PAD = 6
const ARCH_CELL_COLS = 2
const ARCH_MIN_COL_W = ARCH_CELL_COLS * ARCH_NODE_W + (ARCH_CELL_COLS - 1) * ARCH_NODE_GAP + ARCH_CELL_PAD * 2

export type ArchAxis = 'businessLine' | 'domain' | 'owner'

export interface ArchLayoutOptions {
  expandedLayers?: Set<ArchTier>
  focusedCol?: string | null
  columnAxis?: ArchAxis
}

export function architectureLayout(
  nodes: SystemNode[],
  relations: SystemRelation[],
  topologyData?: TopologyData,
  opts: ArchLayoutOptions = {},
): Node[] {
  const { expandedLayers = new Set<ArchTier>(), focusedCol = null, columnAxis = 'businessLine' } = opts
  const blMaps = buildBusinessLineMaps(topologyData)
  const domainMaps = buildDomainMaps(topologyData)
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  const cells: Record<string, SystemNode[]> = {}
  const addToCell = (tier: string, col: string, node: SystemNode) => {
    const key = `${tier}|${col}`
    ;(cells[key] ??= []).push(node)
  }

  const ungroupedKey = '__ungrouped__'

  const columnKeyOf = (n: SystemNode, tier: ArchTier): string => {
    if (columnAxis === 'businessLine') {
      if (tier === 'external') {
        const inferred = inferExternalColumn(n.id, relations, nodeMap)
        if (inferred) return inferred
      }
      return n.businessLine || ungroupedKey
    }
    if (columnAxis === 'domain') {
      return (topologyData && nodePrimaryDomain(n, topologyData)) || ungroupedKey
    }
    return n.owner || '未分配'
  }

  nodes.forEach((n) => {
    const tier = classifyTier(n)
    if (tier === 'infrastructure' || tier === 'middleware' || tier === 'platform') {
      // 底层（中间件/基础设施/平台）不按业务线分列，单列展示
      addToCell(tier, '__base__', n)
      return
    }
    addToCell(tier, columnKeyOf(n, tier), n)
  })

  type ColDef = { key: string; label: string; color: string }
  type TopCol =
    | { type: 'group'; id: string; label: string; color: string; children: ColDef[] }
    | { type: 'single'; col: ColDef }

  const topCols: TopCol[] = []

  const hasColumn = (key: string) => LAYER_ORDER.some((t) => cells[`${t}|${key}`]?.length)

  if (columnAxis === 'businessLine') {
    blMaps.groups.forEach((g) => {
      const children: ColDef[] = []
      g.children.forEach((childKey) => {
        if (hasColumn(childKey)) {
          children.push({
            key: childKey,
            label: blMaps.labels[childKey] || childKey,
            color: blMaps.colors[childKey] || '#8c8c8c',
          })
        }
      })
      if (children.length > 0) {
        topCols.push({ type: 'group', id: g.id, label: g.label, color: g.color, children })
      }
    })

    blMaps.standalones.forEach((key) => {
      if (hasColumn(key)) {
        topCols.push({
          type: 'single',
          col: { key, label: blMaps.labels[key] || key, color: blMaps.colors[key] || '#8c8c8c' },
        })
      }
    })
  } else if (columnAxis === 'domain') {
    domainMaps.domains.forEach((d) => {
      if (hasColumn(d.id)) {
        topCols.push({ type: 'single', col: { key: d.id, label: d.name, color: d.color } })
      }
    })
  } else {
    const ownerCounts: Record<string, number> = {}
    Object.entries(cells).forEach(([key, list]) => {
      const [tier, col] = key.split('|')
      if (col === '__base__') return
      if (!LAYER_ORDER.includes(tier as ArchTier)) return
      ownerCounts[col] = (ownerCounts[col] || 0) + list.length
    })
    Object.entries(ownerCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([owner]) => {
        topCols.push({
          type: 'single',
          col: { key: owner, label: owner === ungroupedKey ? '未分组' : owner, color: '#8c8c8c' },
        })
      })
  }

  if (hasColumn(ungroupedKey)) {
    topCols.push({
      type: 'single',
      col: { key: ungroupedKey, label: '通用 / 未分组', color: '#bfbfbf' },
    })
  }

  const flatCols: ColDef[] = []
  topCols.forEach((tc) => {
    if (tc.type === 'single') flatCols.push(tc.col)
    else tc.children.forEach((c) => flatCols.push(c))
  })

  const appTiers: ArchTier[] = ['external', 'access', 'application', 'platform', 'middleware', 'infrastructure']

  const cellRows = (count: number) => Math.ceil(count / ARCH_CELL_COLS)

  const colWidths = new Map<string, number>()
  flatCols.forEach((col) => {
    let maxCount = 0
    appTiers.forEach((tier) => {
      const count = cells[`${tier}|${col.key}`]?.length || 0
      if (count > maxCount) maxCount = count
    })
    const neededCols = Math.min(maxCount, ARCH_CELL_COLS)
    const w = neededCols * ARCH_NODE_W + Math.max(neededCols - 1, 0) * ARCH_NODE_GAP + ARCH_CELL_PAD * 2
    colWidths.set(col.key, Math.max(w, ARCH_MIN_COL_W))
  })

  const tierHeights = new Map<string, number>()
  appTiers.forEach((tier) => {
    let maxR = 0
    flatCols.forEach((col) => {
      const count = cells[`${tier}|${col.key}`]?.length || 0
      const r = cellRows(count)
      if (r > maxR) maxR = r
    })
    const h = Math.max(maxR, 1) * (ARCH_NODE_H + ARCH_NODE_GAP) - ARCH_NODE_GAP + ARCH_CELL_PAD * 2
    tierHeights.set(tier, Math.max(h, ARCH_NODE_H + ARCH_CELL_PAD * 2))
  })

  const result: Node[] = []
  const bodyStartX = ARCH_TIER_LABEL_W + 12

  const MATRIX_TIERS: ArchTier[] = ['external', 'access', 'application']
  const BASE_TIERS: ArchTier[] = ['platform', 'middleware', 'infrastructure']

  // 列头（仅矩阵层参与分列）
  let hdrColX = bodyStartX
  const headerBaseY = 0
  topCols.forEach((tc) => {
    if (tc.type === 'single') {
      const w = colWidths.get(tc.col.key)!
      const isFocused = focusedCol === tc.col.key
      result.push(makeClusterNode(
        `arch-colhdr-${tc.col.key}`, hdrColX, headerBaseY + ARCH_GRP_HDR_H + 2,
        w, ARCH_COL_HDR_H, tc.col.label, tc.col.color,
        { borderStyle: 'solid', bgOpacity: isFocused ? '30' : '12', borderWidth: isFocused ? 3 : 2 },
      ))
      hdrColX += w + ARCH_COL_GAP
    } else {
      const groupW = tc.children.reduce((s, c) => s + colWidths.get(c.key)!, 0)
        + (tc.children.length - 1) * ARCH_COL_GAP + ARCH_GRP_PAD * 2
      result.push(makeClusterNode(
        `arch-grphdr-${tc.id}`, hdrColX, headerBaseY,
        groupW, ARCH_GRP_HDR_H + ARCH_COL_HDR_H + 4,
        tc.label, tc.color,
      ))
      let childX = hdrColX + ARCH_GRP_PAD
      tc.children.forEach((c) => {
        const w = colWidths.get(c.key)!
        const isFocused = focusedCol === c.key
        result.push(makeClusterNode(
          `arch-colhdr-${c.key}`, childX, headerBaseY + ARCH_GRP_HDR_H + 2,
          w, ARCH_COL_HDR_H, c.label, c.color,
          { borderStyle: 'solid', bgOpacity: isFocused ? '30' : '12', borderWidth: isFocused ? 3 : 2 },
        ))
        childX += w + ARCH_COL_GAP
      })
      hdrColX += groupW + ARCH_COL_GAP
    }
  })

  const totalContentW = Math.max(hdrColX - ARCH_COL_GAP - bodyStartX, ARCH_MIN_COL_W)
  let tierY = ARCH_GRP_HDR_H + ARCH_COL_HDR_H + 4 + ARCH_TIER_GAP

  // 跨层关系徽标（相邻层之间，含矩阵层与基础层边界）
  const ALL_TIERS: ArchTier[] = ['external', 'access', 'application', 'platform', 'middleware', 'infrastructure']
  const crossLayerRows: { from: ArchTier; to: ArchTier; count: number }[] = []
  for (let i = 0; i < ALL_TIERS.length - 1; i++) {
    const from = ALL_TIERS[i]
    const to = ALL_TIERS[i + 1]
    let count = 0
    relations.forEach((r) => {
      const a = nodeMap.get(r.source)
      const b = nodeMap.get(r.target)
      if (!a || !b) return
      const ta = classifyTier(a)
      const tb = classifyTier(b)
      if ((ta === from && tb === to) || (ta === to && tb === from)) count++
    })
    if (count > 0) crossLayerRows.push({ from, to, count })
  }

  // 渲染单层（矩阵层：按列；基础层：单行平铺）
  const renderTier = (tier: ArchTier, isBase: boolean) => {
    const isCollapsed = expandedLayers.has(tier)
    const nodeList = isBase
      ? (cells[`${tier}|__base__`] || [])
      : (() => {
          const all: SystemNode[] = []
          flatCols.forEach((col) => {
            const ns = cells[`${tier}|${col.key}`]
            if (ns) all.push(...ns)
          })
          return all
        })()
    const count = nodeList.length

    // 折叠：高度压成一行标签
    let h: number
    if (isBase) {
      h = isCollapsed ? ARCH_COL_HDR_H + 8 : ARCH_COL_HDR_H + 8 + Math.ceil(count / 8) * (ARCH_NODE_H + ARCH_NODE_GAP)
    } else {
      h = isCollapsed ? ARCH_COL_HDR_H + 8 : (tierHeights.get(tier) || ARCH_NODE_H + ARCH_CELL_PAD * 2)
    }

    result.push(makeClusterNode(
      `arch-tier-bg-${tier}`, bodyStartX, tierY,
      totalContentW, h,
      '', LAYER_COLORS[tier], { borderStyle: 'solid', bgOpacity: '12' },
    ))

    const layerNode = makeClusterNode(
      `arch-tier-${tier}`, 0, tierY,
      ARCH_TIER_LABEL_W, h,
      isCollapsed ? `${LAYER_LABELS[tier]} (${count}) ▸` : LAYER_LABELS[tier],
      LAYER_COLORS[tier],
      { borderStyle: 'solid', bgOpacity: '20', variant: 'tier-label' },
    )
    layerNode.data = {
      ...layerNode.data,
      variant: isCollapsed ? 'tier-collapsed' : 'tier-label',
      tierKey: tier,
      isCollapsed,
      label: isCollapsed ? `${LAYER_LABELS[tier]} (${count}) ▸` : LAYER_LABELS[tier],
    }
    result.push(layerNode)

    if (isCollapsed) {
      tierY += h + ARCH_TIER_GAP
      return
    }

    if (isBase) {
      // 基础层单行平铺
      const perRow = Math.max(Math.floor((totalContentW - ARCH_CELL_PAD * 2) / (ARCH_NODE_W + ARCH_NODE_GAP)), 1)
      nodeList.forEach((node, i) => {
        result.push({
          id: node.id,
          type: 'system',
          position: {
            x: bodyStartX + ARCH_CELL_PAD + (i % perRow) * (ARCH_NODE_W + ARCH_NODE_GAP),
            y: tierY + ARCH_CELL_PAD + Math.floor(i / perRow) * (ARCH_NODE_H + ARCH_NODE_GAP),
          },
          data: toNodeData(node),
        })
      })
    } else {
      // 矩阵层：按列渲染
      let cx = bodyStartX
      let colIdx = 0
      topCols.forEach((tc) => {
        const cols = tc.type === 'single' ? [tc.col] : tc.children
        if (tc.type === 'group') cx += ARCH_GRP_PAD
        cols.forEach((col) => {
          const w = colWidths.get(col.key)!
          const cellNodes = cells[`${tier}|${col.key}`] || []
          const tcKey = tc.type === 'group' ? tc.id : tc.col.key
          const colDimmed = focusedCol !== null && focusedCol !== col.key && focusedCol !== tcKey

          if (colIdx > 0) {
            result.push({
              id: `arch-sepline-${tier}-${col.key}`,
              type: 'cluster',
              position: { x: cx - ARCH_COL_GAP / 2, y: tierY + 4 },
              style: {
                width: 1, height: h - 8,
                backgroundColor: `${LAYER_COLORS[tier]}18`,
                border: 'none', borderRadius: 0,
              },
              data: { label: '', color: 'transparent', variant: 'col-separator' },
            })
          }

          cellNodes.forEach((node, i) => {
            const col2 = i % ARCH_CELL_COLS
            const row = Math.floor(i / ARCH_CELL_COLS)
            const nodeX = cx + ARCH_CELL_PAD + col2 * (ARCH_NODE_W + ARCH_NODE_GAP)
            const nodeY = tierY + ARCH_CELL_PAD + row * (ARCH_NODE_H + ARCH_NODE_GAP)
            result.push({
              id: node.id,
              type: 'system',
              position: { x: nodeX, y: nodeY },
              data: { ...toNodeData(node), dimmed: colDimmed ? true : undefined },
              style: colDimmed ? { opacity: 0.15 } : undefined,
            })
          })

          cx += w + ARCH_COL_GAP
          colIdx++
        })
        if (tc.type === 'group') cx += ARCH_GRP_PAD
      })
    }

    tierY += h + ARCH_TIER_GAP

    // 跨层徽标行
    const badge = crossLayerRows.find((r) => r.from === tier)
    if (badge) {
      result.push({
        id: `arch-cross-${badge.from}-${badge.to}`,
        type: 'system',
        position: { x: bodyStartX, y: tierY - ARCH_TIER_GAP + 1 },
        style: { width: 180, height: 22 },
        data: {
          name: `${LAYER_LABELS[badge.from]} → ${LAYER_LABELS[badge.to]}: ${badge.count}`,
          description: '点击聚焦跨层关系',
          layer: 'infrastructure',
          isCrossLayerBadge: true,
          crossFrom: badge.from,
          crossTo: badge.to,
        },
      })
      tierY += ARCH_COL_HDR_H
    }
  }

  MATRIX_TIERS.forEach((tier) => renderTier(tier, false))
  BASE_TIERS.forEach((tier) => renderTier(tier, true))

  return result
}
