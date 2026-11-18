'use client'

import { useCallback, useMemo, useEffect, useState, useRef } from 'react'
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  BackgroundVariant,
  MarkerType,
  ConnectionMode,
  NodeProps,
  Panel,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
} from '@xyflow/react'
import type { Node, Edge, ReactFlowInstance } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { ProcessCatalog, ProcessDomain, ProcessHost } from '@/types'

interface ProcessNodeData extends Record<string, unknown> {
  label?: string
  color?: string
  linked?: boolean
  host?: ProcessHost
  hostLabel?: string
  hostColor?: string
}

/** 宿主引擎标签：名称/颜色都来自数据词表（buildProcessHostMaps），不在组件里写死 */
function HostTag({ host, label, color }: { host?: ProcessHost; label?: string; color?: string }) {
  if (host && color) {
    return (
      <span
        className="px-1 py-0.5 rounded text-[9px] leading-none font-medium"
        style={{ color, backgroundColor: `${color}14`, border: `1px solid ${color}40` }}
      >
        {label || host}
      </span>
    )
  }
  return (
    <span className="px-1 py-0.5 rounded text-[9px] leading-none text-gray-300 bg-gray-50 border border-gray-100">
      待标注
    </span>
  )
}

function ProcessNodeComponent({ data }: NodeProps) {
  const d = data as ProcessNodeData
  const color = d.color || '#6b7280'

  return (
    <div
      className="rounded-lg border bg-white px-2.5 py-1.5 shadow-sm"
      style={{ width: 232, borderColor: `${color}66`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
    >
      <Handle type="target" position={Position.Left} style={{ width: 8, height: 8, background: '#cbd5e1', border: '1px solid #fff' }} />
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-[12px] font-medium text-gray-800 truncate">{d.label}</span>
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[9px] text-gray-400 font-mono">{d.id as string}</span>
        <span className="flex items-center gap-1">
          <HostTag host={d.host} label={d.hostLabel} color={d.hostColor} />
          {d.linked && (
            <span className="flex items-center gap-0.5 text-[9px] text-green-600">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            </span>
          )}
        </span>
      </div>
      <Handle type="source" position={Position.Right} style={{ width: 8, height: 8, background: '#cbd5e1', border: '1px solid #fff' }} />
    </div>
  )
}

interface GroupNodeData extends Record<string, unknown> {
  label?: string
  color?: string
}

function GroupNodeComponent({ data }: NodeProps) {
  const d = data as GroupNodeData
  return (
    <div
      className="pointer-events-none whitespace-nowrap"
      style={{ fontSize: 11, fontWeight: 600, color: d.color || '#8b94a8', letterSpacing: '.3px', paddingLeft: 6 }}
    >
      {d.label}
    </div>
  )
}

const nodeTypes = { process: ProcessNodeComponent, groupLabel: GroupNodeComponent }

export type ProcessFocus = string | null

interface Props {
  catalog: ProcessCatalog
  selectedId?: ProcessFocus
  onSelect?: (id: ProcessFocus) => void
  showAll?: boolean
  onToggleAll?: () => void
  hostFilter?: ProcessHost | 'all' | 'unknown'
  /** 宿主引擎词表（来自数据，缺省用内置默认） */
  hostLabels?: Record<string, string>
  hostColors?: Record<string, string>
  /** 业务域色表（来自数据，缺省用内置默认） */
  domainColors?: Record<string, string>
}

const NODE_H = 44
const COL_W = 300
const GROUP_LABEL_H = 26

/** 板块分栏布局：每个板块一列，组标签 + 流程纵向排布 */
function computeLayout(domains: ProcessDomain[], domainColors: Record<string, string>) {
  const pos: Record<string, { x: number; y: number }> = {}
  const groups: { id: string; label: string; x: number; y: number; color: string }[] = []
  domains.forEach((dom, di) => {
    const x = 40 + di * COL_W
    let y = 56
    dom.groups.forEach((g) => {
      y += GROUP_LABEL_H
      groups.push({ id: g.id, label: g.name, x, y, color: domainColors[dom.id] || '#6b7280' })
      y += 22
      g.processes.forEach((p) => {
        pos[p.id] = { x, y }
        y += NODE_H + 10
      })
    })
  })
  return { pos, groups }
}

const ProcessGraph = ({
  catalog,
  selectedId,
  onSelect,
  showAll = true,
  onToggleAll,
  hostFilter = 'all',
  hostLabels = {},
  hostColors = {},
  domainColors = {},
}: Props) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const rfRef = useRef<ReactFlowInstance | null>(null)

  const focusId = selectedId || hoveredId

  const domainOrder = useMemo(
    () => catalog.domains.map((d) => d.id),
    [catalog.domains],
  )

  const { pos, groups } = useMemo(() => computeLayout(catalog.domains, domainColors), [catalog.domains, domainColors])

  const nodes = useMemo<Node[]>(() => {
    const visible = new Set<string>()
    catalog.domains.forEach((dom) =>
      dom.groups.forEach((g) =>
        g.processes.forEach((p) => {
          if (hostFilter === 'all' || p.host === hostFilter || (hostFilter === 'unknown' && !p.host)) visible.add(p.id)
        }),
      ),
    )
    const result: Node[] = []
    groups.forEach((g) => {
      const grp = catalog.domains.flatMap((d) => d.groups).find((x) => x.id === g.id)
      const hasVisible = grp ? grp.processes.some((p) => visible.has(p.id)) : false
      if (!hasVisible) return
      result.push({
        id: `grp-${g.id}`,
        type: 'groupLabel',
        position: { x: g.x, y: g.y },
        data: { label: g.label, color: g.color },
        draggable: false,
        selectable: false,
        focusable: false,
        className: '!pointer-events-none',
      })
    })
    catalog.domains.forEach((dom) => {
      dom.groups.forEach((grp) => {
        grp.processes.forEach((p) => {
          if (!visible.has(p.id)) return
          const ppos = pos[p.id]
          if (!ppos) return
          result.push({
            id: p.id,
            type: 'process',
            position: { x: ppos.x, y: ppos.y },
            data: {
              id: p.id,
              label: p.name,
              color: domainColors[dom.id] || '#6b7280',
              linked: !!p.systems?.length,
              host: p.host,
              hostLabel: p.host ? hostLabels[p.host] : undefined,
              hostColor: p.host ? hostColors[p.host] : undefined,
            },
            draggable: false,
          })
        })
      })
    })
    return result
  }, [catalog, groups, pos, hostFilter, hostLabels, hostColors, domainColors])

  const { relatedEdgeIds, outEdgeIds } = useMemo(() => {
    if (!focusId) return { relatedEdgeIds: null, outEdgeIds: null }
    const rel = new Set<string>()
    const out = new Set<string>()
    catalog.dependencies.forEach((dep, i) => {
      const eid = `d${i}`
      if (dep.from === focusId) { rel.add(eid); out.add(eid) }
      if (dep.to === focusId) rel.add(eid)
    })
    return { relatedEdgeIds: rel, outEdgeIds: out }
  }, [focusId, catalog.dependencies])

  const edges = useMemo<Edge[]>(() => {
    const visible = new Set(nodes.filter((n) => n.type === 'process').map((n) => n.id))
    return catalog.dependencies.flatMap((dep, i) => {
      if (!visible.has(dep.from) || !visible.has(dep.to)) return []
      const eid = `d${i}`
      const isRelated = relatedEdgeIds?.has(eid)
      const isOut = outEdgeIds?.has(eid)
      const color = isRelated ? (isOut ? '#1fbf75' : '#f59a23') : '#c5cad6'
      const hidden = !showAll && !(focusId && isRelated)
      return [{
        id: eid,
        source: dep.from,
        target: dep.to,
        type: 'smoothstep',
        hidden,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: isRelated ? (isOut ? '#1fbf75' : '#f59a23') : '#b6bcc9',
        },
        style: {
          stroke: color,
          strokeWidth: isRelated ? 2.2 : 1,
          opacity: relatedEdgeIds ? (isRelated ? 1 : 0.12) : 0.55,
          transition: 'stroke 0.15s, opacity 0.15s',
        },
        zIndex: isRelated ? 10 : 0,
      }]
    })
  }, [catalog.dependencies, relatedEdgeIds, outEdgeIds, showAll, focusId, nodes])

  const dimRelatedNodes = useCallback(
    (ids: Node[]) => {
      const related = new Set<string>()
      if (focusId) {
        catalog.dependencies.forEach((dep) => {
          if (dep.from === focusId || dep.to === focusId) { related.add(dep.from); related.add(dep.to) }
        })
      }
      return ids.map((n) => {
        if (n.type === 'groupLabel') {
          const opacity = focusId ? 0.35 : 1
          if (n.style?.opacity === opacity) return n
          return { ...n, style: { ...n.style, opacity } }
        }
        const dimmed = !!focusId && n.id !== focusId && !related.has(n.id)
        const opacity = dimmed ? 0.12 : 1
        if (n.style?.opacity === opacity) return n
        return { ...n, style: { ...n.style, opacity } }
      })
    },
    [focusId, catalog.dependencies],
  )

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(nodes)
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(edges)

  useEffect(() => { setRfNodes(dimRelatedNodes(nodes)) }, [nodes, dimRelatedNodes, setRfNodes])
  useEffect(() => { setRfEdges(edges) }, [edges, setRfEdges])

  // 选中节点变化时（含 URL 直达/跨页跳转）定位居中
  useEffect(() => {
    if (!selectedId) return
    const t = setTimeout(() => {
      const rf = rfRef.current
      if (!rf) return
      const n = rf.getNode(selectedId)
      if (n) rf.fitView({ nodes: [n], padding: 0.5, duration: 400, maxZoom: 1.3 })
    }, 120)
    return () => clearTimeout(t)
  }, [selectedId])

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === 'groupLabel') return
      onSelect?.(selectedId === node.id ? null : node.id)
    },
    [onSelect, selectedId],
  )

  const onPaneClick = useCallback(() => { onSelect?.(null) }, [onSelect])

  // hover 防抖：避免在节点子元素间微移时 hoveredId 快速翻转导致画布闪烁
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onNodeEnter = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'groupLabel') return
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null }
    setHoveredId(node.id)
  }, [])
  const onNodeLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = setTimeout(() => { setHoveredId(null); hoverTimerRef.current = null }, 120)
  }, [])

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeEnter}
        onNodeMouseLeave={onNodeLeave}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        onInit={(instance) => { rfRef.current = instance }}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => {
            if (n.type === 'groupLabel') return 'transparent'
            const dom = domainOrder.find((d, i) => n.position.x >= 40 + i * COL_W - COL_W / 2 && n.position.x < 40 + i * COL_W + COL_W / 2)
            return dom ? domainColors[dom] || '#6b7280' : '#ccc'
          }}
          maskColor="rgba(0,0,0,0.05)"
        />
        <Panel position="top-right" className="!m-2">
          <button
            onClick={onToggleAll}
            className={`text-[11px] px-2.5 py-1 rounded-md border transition-all ${showAll ? 'bg-white text-gray-600 border-gray-200 hover:border-blue-300' : 'bg-blue-500 text-white border-blue-500'}`}
          >
            {showAll ? '仅看选中连线' : '显示全部连线'}
          </button>
          {!showAll && (
            <div className="mt-1.5 text-[10px] text-gray-400 bg-white/80 rounded px-2 py-1 border border-gray-100">
              悬停/点击流程只显示它的上下游连线
            </div>
          )}
        </Panel>
      </ReactFlow>
    </div>
  )
}

export default ProcessGraph
