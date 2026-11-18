'use client'

import { useEffect, useMemo, useState } from 'react'
import { ReactFlow, Background, BackgroundVariant, Controls, MiniMap, MarkerType, NodeProps } from '@xyflow/react'
import type { Node, Edge, EdgeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import SystemNodeComponent from './SystemNode'
import type { TopologyData, SystemLayer } from '@/types'
import { LAYER_COLORS, LAYER_LABELS } from '@/types'
import { elkLayered, type ElkPoint } from '@/lib/elkLayout'

const NODE_W = 120
const NODE_H = 46

// 分层顺序（上 → 下），同时作为 ELK 分区号
const LAYER_ROWS: (SystemLayer | 'none')[] = ['external', 'access', 'application', 'platform', 'middleware', 'infrastructure', 'none']
const LAYER_PARTITION: Record<string, number> = Object.fromEntries(LAYER_ROWS.map((L, i) => [L, i]))

interface BandData extends Record<string, unknown> {
  label: string
  color: string
  count: number
  width: number
  height: number
}

function LayerBandComponent({ data }: NodeProps) {
  const d = data as BandData
  return (
    <div className="pointer-events-none rounded-xl" style={{ width: d.width, height: d.height, background: `${d.color}0D`, border: `1px dashed ${d.color}55` }}>
      <span className="absolute top-1.5 left-2.5 text-[11px] font-semibold" style={{ color: d.color }}>
        {d.label} · {d.count}
      </span>
    </div>
  )
}

/** 把 ELK 的正交折线画成带圆角的路径 */
function roundedPath(pts: ElkPoint[], r = 8): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1]
    const v1 = { x: p1.x - p0.x, y: p1.y - p0.y }
    const v2 = { x: p2.x - p1.x, y: p2.y - p1.y }
    const l1 = Math.hypot(v1.x, v1.y) || 1
    const l2 = Math.hypot(v2.x, v2.y) || 1
    const rr = Math.min(r, l1 / 2, l2 / 2)
    const a = { x: p1.x - (v1.x / l1) * rr, y: p1.y - (v1.y / l1) * rr }
    const b = { x: p1.x + (v2.x / l2) * rr, y: p1.y + (v2.y / l2) * rr }
    d += ` L ${a.x} ${a.y} Q ${p1.x} ${p1.y} ${b.x} ${b.y}`
  }
  const last = pts[pts.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

function ElkEdgeComponent({ data, markerEnd, style }: EdgeProps) {
  const pts = (data as { points?: ElkPoint[] })?.points
  if (!pts || pts.length < 2) return null
  return (
    <path
      d={roundedPath(pts)}
      fill="none"
      stroke={(style?.stroke as string) || '#94a3b8'}
      strokeWidth={(style?.strokeWidth as number) || 1.6}
      strokeLinejoin="round"
      markerEnd={markerEnd as string | undefined}
    />
  )
}

const nodeTypes = { system: SystemNodeComponent, layerBand: LayerBandComponent }
const edgeTypes = { elk: ElkEdgeComponent }

export type EgoLayout = 'direction' | 'layer'

interface Props {
  data: TopologyData
  focusId: string
  depth?: number
  layout?: EgoLayout
  onNodeClick?: (id: string) => void
}

export default function EgoGraph({ data, focusId, depth = 2, layout = 'direction', onNodeClick }: Props) {
  const [rfNodes, setRfNodes] = useState<Node[]>([])
  const [rfEdges, setRfEdges] = useState<Edge[]>([])
  const [loading, setLoading] = useState(true)

  // 先同步计算自我网络（节点集/边集/方向）
  const ego = useMemo(() => {
    const rels = data.relations
    const has = (arr: string[], id: string) => arr.includes(id)

    const upNodes = new Set<string>()
    let frontier = [focusId]
    const seenUp = new Set<string>([focusId])
    for (let d = 0; d < depth; d++) {
      const next: string[] = []
      rels.forEach((r) => { if (has(frontier, r.target) && !seenUp.has(r.source)) { seenUp.add(r.source); upNodes.add(r.source); next.push(r.source) } })
      frontier = next
    }
    const downNodes = new Set<string>()
    frontier = [focusId]
    const seenDown = new Set<string>([focusId])
    for (let d = 0; d < depth; d++) {
      const next: string[] = []
      rels.forEach((r) => { if (has(frontier, r.source) && !seenDown.has(r.target)) { seenDown.add(r.target); downNodes.add(r.target); next.push(r.target) } })
      frontier = next
    }

    const egoIds = new Set<string>([focusId, ...upNodes, ...downNodes])
    const sysMap = new Map(data.nodes.map((n) => [n.id, n]))

    // 合并同向重复边
    const pairMap = new Map<string, { source: string; target: string }>()
    rels.forEach((r) => {
      if (egoIds.has(r.source) && egoIds.has(r.target)) pairMap.set(`${r.source}->${r.target}`, { source: r.source, target: r.target })
    })
    const pairRels = Array.from(pairMap.entries()).map(([key, v]) => ({ key, ...v }))

    const colorOf = (source: string, target: string) => {
      const upstream = target === focusId || upNodes.has(target)
      const downstream = source === focusId || downNodes.has(source)
      return upstream ? '#f59a23' : downstream ? '#1fbf75' : '#94a3b8'
    }

    return { egoIds, upNodes, downNodes, sysMap, pairRels, colorOf }
  }, [data, focusId, depth])

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 依赖变化时重置加载态是必要的同步
    setLoading(true)

    const ids = Array.from(ego.egoIds)
    const edges = ego.pairRels.map((p) => ({ id: p.key, source: p.source, target: p.target }))
    const partitions = layout === 'layer'
      ? Object.fromEntries(ids.map((id) => [id, LAYER_PARTITION[ego.sysMap.get(id)?.layer || 'none'] ?? 6]))
      : undefined

    elkLayered({ ids, edges, width: NODE_W, height: NODE_H, direction: 'DOWN', partitions })
      .then((res) => {
        if (cancelled) return
        const pos = new Map(res.nodes.map((n) => [n.id, n]))

        const nodes: Node[] = ids.map((id) => {
          const sys = ego.sysMap.get(id)
          const p = pos.get(id)
          return {
            id,
            type: 'system',
            position: { x: p?.x ?? 0, y: p?.y ?? 0 },
            zIndex: 1,
            data: {
              name: sys?.name || id,
              description: sys?.description || '',
              layer: sys?.layer,
              appType: sys?.appType,
              owner: sys?.owner,
              url: sys?.url,
              links: sys?.links,
              currentEnv: 'production' as const,
            },
            style: id === focusId ? { boxShadow: '0 0 0 3px rgba(37,99,235,0.4)', borderRadius: 10 } : undefined,
          }
        })

        // 分层模式：按分区画带（用 ELK 结果算每个分区的包围盒）
        if (layout === 'layer') {
          const byPart = new Map<number, { minX: number; minY: number; maxX: number; maxY: number; ids: string[] }>()
          ids.forEach((id) => {
            const p = pos.get(id)
            if (!p) return
            const part = partitions ? partitions[id] : 0
            const b = byPart.get(part) || { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, ids: [] }
            b.minX = Math.min(b.minX, p.x); b.minY = Math.min(b.minY, p.y)
            b.maxX = Math.max(b.maxX, p.x + NODE_W); b.maxY = Math.max(b.maxY, p.y + NODE_H)
            b.ids.push(id)
            byPart.set(part, b)
          })
          const pad = 16
          byPart.forEach((b, part) => {
            const L = LAYER_ROWS[part] || 'none'
            const color = L === 'none' ? '#94a3b8' : LAYER_COLORS[L]
            const label = L === 'none' ? '未分层' : LAYER_LABELS[L]
            nodes.push({
              id: `band-${part}`,
              type: 'layerBand',
              position: { x: b.minX - pad, y: b.minY - pad - 18 },
              zIndex: 0,
              selectable: false,
              draggable: false,
              data: { label, color, count: b.ids.length, width: b.maxX - b.minX + pad * 2, height: b.maxY - b.minY + pad * 2 + 18 },
            })
          })
        }

        const edgeMap = new Map(res.edges.map((e) => [e.id, e.points]))
        const edgeList: Edge[] = ego.pairRels.map((p) => {
          const color = ego.colorOf(p.source, p.target)
          return {
            id: p.key,
            source: p.source,
            target: p.target,
            type: 'elk',
            zIndex: 5,
            data: { points: edgeMap.get(p.key) || [], color },
            style: { stroke: color, strokeWidth: 1.6, opacity: 0.85 },
            markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13, color },
          }
        })

        setRfNodes(nodes)
        setRfEdges(edgeList)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [ego, layout, focusId])

  return (
    <div className="w-full h-full relative">
      {loading && <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm z-10">布局计算中…</div>}
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.15}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, n) => { if (n.type === 'system') onNodeClick?.(n.id) }}
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => {
            if (n.type === 'layerBand') return 'transparent'
            const layer = (n.data as { layer?: SystemLayer }).layer
            return (layer && LAYER_COLORS[layer]) || '#ccc'
          }}
          maskColor="rgba(0,0,0,0.05)"
        />
      </ReactFlow>
    </div>
  )
}
