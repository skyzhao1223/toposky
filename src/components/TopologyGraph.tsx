'use client'

import { useCallback, useMemo, useEffect, useState, useRef, forwardRef, useImperativeHandle } from 'react'
import type { ReactNode } from 'react'
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  MarkerType,
  ConnectionMode,
  NodeProps,
} from '@xyflow/react'
import type { Node, Edge, ReactFlowInstance } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import SystemNodeComponent from './SystemNode'
import Legend from './Legend'
import { flatLayout, clusterLayout, architectureLayout } from './layouts'
import type { ArchAxis } from './layouts'
import { TopologyData, LAYER_COLORS, RELATION_LABELS, SystemLayer, EnvType, nodeLayer } from '@/types'
import { ClusterMode } from './FilterToolbar'

interface GroupNodeData extends Record<string, unknown> {
  label?: string
  color?: string
  headerBg?: string
  variant?: string
}

function GroupNodeComponent(props: NodeProps) {
  const data = props.data as GroupNodeData
  if (data.variant === 'tier-label') {
    return (
      <div className="w-full h-full flex items-center justify-center rounded-xl pointer-events-none"
        style={{ backgroundColor: data.headerBg || 'transparent' }}>
        <span className="text-sm font-bold tracking-wide" style={{ color: data.color || '#595959' }}>
          {data.label}
        </span>
      </div>
    )
  }
  if (data.variant === 'col-separator') {
    return <div className="w-full h-full pointer-events-none" />
  }
  return (
    <div className="w-full h-full relative pointer-events-none">
      <div
        className="absolute top-0 left-0 right-0 text-center text-xs font-semibold py-1.5 rounded-t-[10px]"
        style={{ color: data.color || '#595959', backgroundColor: data.headerBg || 'transparent' }}
      >
        {data.label}
      </div>
    </div>
  )
}

const nodeTypes = { system: SystemNodeComponent, cluster: GroupNodeComponent }

export type EdgeMode = 'none' | 'related' | 'all'

export interface TopologyGraphHandle {
  centerNode: (nodeId: string) => void
}

interface Props {
  data: TopologyData
  clusterMode: ClusterMode
  archMode: boolean
  archAxis: ArchAxis
  edgeMode: EdgeMode
  currentEnv?: EnvType
  searchMatchIds?: Set<string> | null
  onNodePositionChange?: (nodeId: string, position: { x: number; y: number }) => void
  selectedNodeId?: string | null
  onNodeSelect?: (nodeId: string | null) => void
  /** 当前选中的关系（边）：高亮并在页面上查看「凭什么成立」 */
  selectedRelationId?: string | null
  onEdgeSelect?: (relationId: string | null) => void
  onNodeEdit?: (nodeId: string) => void
  collapsedLayers?: Set<SystemLayer>
  focusedCol?: string | null
  onToggleLayer?: (layer: SystemLayer) => void
  onFocusCol?: (colKey: string) => void
  crossLayerFocus?: { from: string; to: string } | null
  onFocusCrossLayer?: (from: string, to: string) => void
  activeFlowId?: string | null
  onNodeFocusEgo?: (nodeId: string) => void
}

const TopologyGraph = forwardRef<TopologyGraphHandle, Props>(function TopologyGraph(
  { data, clusterMode, archMode, archAxis, edgeMode, currentEnv, searchMatchIds, onNodePositionChange, selectedNodeId, onNodeSelect, onNodeEdit,
    collapsedLayers, focusedCol, onToggleLayer, onFocusCol, crossLayerFocus, onFocusCrossLayer, activeFlowId, onNodeFocusEgo,
    selectedRelationId, onEdgeSelect },
  ref,
) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null)
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null)

  // 布局模式切换时重置展开状态（响应外部 prop 变化的受控重置）
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setExpandedGroups(new Set()) }, [clusterMode])

  const focusNodeId = selectedNodeId || hoveredNodeId

  const nodeMap = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes])
  const relationMap = useMemo(() => new Map(data.relations.map((r) => [r.id, r])), [data.relations])

  useImperativeHandle(ref, () => ({
    centerNode(nodeId: string) {
      const rf = rfInstanceRef.current
      if (!rf) return
      const node = rf.getNode(nodeId)
      if (!node) return
      const x = node.position.x + (node.width || 140) / 2
      const y = node.position.y + (node.height || 40) / 2
      rf.setCenter(x, y, { zoom: 1.2, duration: 400 })
    },
  }), [])

  const { relatedNodeIds, relatedEdgeIds } = useMemo(() => {
    if (!focusNodeId) return { relatedNodeIds: null, relatedEdgeIds: null }
    const nodeIds = new Set<string>([focusNodeId])
    const edgeIds = new Set<string>()
    data.relations.forEach((r) => {
      if (r.source === focusNodeId || r.target === focusNodeId) {
        nodeIds.add(r.source)
        nodeIds.add(r.target)
        edgeIds.add(r.id)
      }
    })
    return { relatedNodeIds: nodeIds, relatedEdgeIds: edgeIds }
  }, [focusNodeId, data.relations])

  // activeFlow 的步骤节点 → 序号映射（用于高亮 + 右上角序号标）
  const flowStepMap = useMemo(() => {
    if (!activeFlowId) return null
    const flow = (data.businessFlows || []).find((f) => f.id === activeFlowId)
    if (!flow) return null
    const m = new Map<string, number>()
    flow.steps.forEach((s, i) => { m.set(s.nodeId, i + 1) })
    return m
  }, [activeFlowId, data.businessFlows])

  const computedNodes = useMemo(() => {
    let layoutNodes: Node[]
    if (archMode) {
      layoutNodes = architectureLayout(data.nodes, data.relations, data, {
        expandedLayers: collapsedLayers,
        focusedCol,
        columnAxis: archAxis,
      })
    } else if (clusterMode === 'none') {
      layoutNodes = flatLayout(data.nodes)
    } else {
      layoutNodes = clusterLayout(data.nodes, clusterMode, data.relations, expandedGroups)
    }

    return layoutNodes.map((node) => {
      if (node.type === 'cluster') return node
      const sysNode = nodeMap.get(node.id)
      const envInfo = currentEnv ? sysNode?.environments?.[currentEnv] : undefined
      const flowStep = flowStepMap?.get(node.id)
      return { ...node, data: { ...node.data, links: sysNode?.links, envInfo, currentEnv, flowStep, appType: sysNode?.appType, url: sysNode?.url, vendor: sysNode?.vendor, contacts: sysNode?.contacts } }
    })
  }, [data, clusterMode, archMode, archAxis, currentEnv, expandedGroups, nodeMap, collapsedLayers, focusedCol, flowStepMap])

  const nodeLayerMap = useMemo(() => {
    const m = new Map<string, string>()
    data.nodes.forEach((n) => { if (n.layer) m.set(n.id, n.layer) })
    return m
  }, [data.nodes])

  // activeFlow 相邻步骤边（流内连边）→ 高亮
  const flowEdgePairs = useMemo(() => {
    if (!activeFlowId) return null
    const flow = (data.businessFlows || []).find((f) => f.id === activeFlowId)
    if (!flow) return null
    const pairs = new Set<string>()
    for (let i = 0; i < flow.steps.length - 1; i++) {
      const a = flow.steps[i].nodeId
      const b = flow.steps[i + 1].nodeId
      pairs.add(`${a}::${b}`)
      pairs.add(`${b}::${a}`)
    }
    return pairs
  }, [activeFlowId, data.businessFlows])

  const baseEdges = useMemo(() => {
    if (edgeMode === 'none') return []
    return data.relations.map((r): Edge => {
      const inCross = crossLayerFocus
        ? nodeLayerMap.get(r.source) === crossLayerFocus.from && nodeLayerMap.get(r.target) === crossLayerFocus.to
        : false
      const inFlow = flowEdgePairs ? flowEdgePairs.has(`${r.source}::${r.target}`) : false
      const isSelected = selectedRelationId === r.id
      return {
        id: r.id,
        source: r.source,
        target: r.target,
        type: 'smoothstep',
        hidden: edgeMode === 'related',
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
        style: {
          stroke: isSelected ? '#1677ff'
            : crossLayerFocus ? (inCross ? '#eb2f96' : '#e8e8e8')
            : flowEdgePairs ? (inFlow ? '#1677ff' : '#e8e8e8')
            : '#bfbfbf',
          strokeWidth: isSelected ? 3 : inFlow ? 2.5 : crossLayerFocus && inCross ? 2.5 : 1,
          opacity: isSelected ? 1
            : crossLayerFocus ? (inCross ? 1 : 0.12)
            : flowEdgePairs ? (inFlow ? 1 : 0.15)
            : 1,
          transition: 'stroke 0.2s, opacity 0.2s',
        },
        labelBgPadding: [4, 2] as [number, number],
        data: { label: `${r.label || RELATION_LABELS[r.relationType]}${r.contract?.target ? ` · ${r.contract.target}` : ''}` },
      }
    })
  }, [data.relations, edgeMode, crossLayerFocus, nodeLayerMap, flowEdgePairs, selectedRelationId])

  const [nodes, setNodes, onNodesChange] = useNodesState(computedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(baseEdges)

  useEffect(() => { setNodes(computedNodes) }, [computedNodes, setNodes])
  useEffect(() => { setEdges(baseEdges) }, [baseEdges, setEdges])

  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.type === 'cluster') return node
        const dimmedByRelation = relatedNodeIds ? !relatedNodeIds.has(node.id) : false
        const dimmedBySearch = searchMatchIds ? !searchMatchIds.has(node.id) : false
        const dimmedByFocus = focusedCol ? !!node.data?.dimmed : false
        const inCross = crossLayerFocus
          ? nodeLayerMap.get(node.id) === crossLayerFocus.from || nodeLayerMap.get(node.id) === crossLayerFocus.to
          : true
        const inFlow = flowStepMap ? flowStepMap.has(node.id) : true
        const dimmed = dimmedByRelation || dimmedBySearch || dimmedByFocus || !inCross || !inFlow
        const opacity = dimmed ? (crossLayerFocus ? 0.08 : 0.15) : 1
        if (node.style?.opacity === opacity) return node
        return { ...node, style: { opacity, transition: 'opacity 0.2s' } }
      })
    )
  }, [relatedNodeIds, searchMatchIds, setNodes, focusedCol, crossLayerFocus, nodeLayerMap, flowStepMap])

  useEffect(() => {
    if (!searchMatchIds || searchMatchIds.size === 0) return
    const rf = rfInstanceRef.current
    if (!rf) return
    const matchingNodes = rf.getNodes().filter((n) => searchMatchIds.has(n.id))
    if (matchingNodes.length === 0) return
    rf.fitView({ nodes: matchingNodes, duration: 300, padding: 0.5 })
  }, [searchMatchIds])

  useEffect(() => {
    setEdges((eds) =>
      eds.map((edge) => {
        const isRelated = relatedEdgeIds?.has(edge.id)
        const isHovered = edge.id === hoveredEdgeId

        if (!focusNodeId) {
          const shouldHide = edgeMode === 'related'
          if (isHovered) {
            return {
              ...edge, hidden: false, animated: false,
              zIndex: 1000,
              label: edge.data?.label as ReactNode | undefined,
              labelStyle: { fontSize: 11, fill: '#fff', fontWeight: 600 },
              labelBgStyle: { fill: '#1677ff', fillOpacity: 0.95, rx: 4, ry: 4 },
              style: { stroke: '#1677ff', strokeWidth: 3, opacity: 1, transition: 'stroke 0.15s, opacity 0.15s, stroke-width 0.15s' },
              markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#1677ff' },
            }
          }
          if (edge.hidden === shouldHide && !edge.animated && !edge.label) return edge
          return {
            ...edge, hidden: shouldHide, animated: false,
            zIndex: 0,
            label: undefined, labelStyle: undefined, labelBgStyle: undefined,
            style: { stroke: '#bfbfbf', strokeWidth: 1, transition: 'stroke 0.15s, opacity 0.15s, stroke-width 0.15s' },
            markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
          }
        }

        const shouldShow = edgeMode === 'all' || (edgeMode === 'related' && isRelated)
        const rel = relationMap.get(edge.id)
        const isAnimated = !isHovered && isRelated && !!rel && (rel.relationType === 'calls' || rel.relationType === 'publishes_to')
        return {
          ...edge,
          hidden: edgeMode === 'related' && !shouldShow,
          animated: isAnimated,
          zIndex: isHovered ? 1000 : isRelated ? 10 : 0,
          label: (isHovered || isRelated) ? edge.data?.label as ReactNode : undefined,
          labelStyle: isHovered
            ? { fontSize: 11, fill: '#fff', fontWeight: 600 }
            : isRelated
              ? { fontSize: 10, fill: '#1677ff', fontWeight: 600, stroke: '#fff', strokeWidth: 3, paintOrder: 'stroke' }
              : undefined,
          labelBgStyle: isHovered
            ? { fill: '#1677ff', fillOpacity: 0.95, rx: 4, ry: 4 }
            : isRelated ? { fill: 'transparent', fillOpacity: 0 } : undefined,
          style: {
            stroke: isHovered ? '#1677ff' : isRelated ? '#1677ff' : '#e8e8e8',
            strokeWidth: isHovered ? 3 : isRelated ? 2 : 1,
            opacity: isHovered ? 1 : isRelated ? 1 : 0.15,
            transition: 'stroke 0.15s, opacity 0.15s, stroke-width 0.15s',
          },
          markerEnd: isHovered
            ? { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#1677ff' }
            : { type: MarkerType.ArrowClosed, width: 12, height: 12 },
        }
      })
    )
  }, [focusNodeId, relatedEdgeIds, edgeMode, relationMap, setEdges, hoveredEdgeId])

  const onNodeDragStop = useCallback(
    (_: MouseEvent | TouchEvent, node: Node) => {
      if (node.type !== 'cluster') onNodePositionChange?.(node.id, node.position)
    },
    [onNodePositionChange],
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.data?.isCrossLayerBadge) {
        onFocusCrossLayer?.(node.data.crossFrom as string, node.data.crossTo as string)
        return
      }
      if (node.type === 'cluster') {
        // 层标签：点击折叠/展开
        if (node.id.startsWith('arch-tier-')) {
          const tierKey = node.data?.tierKey as SystemLayer | undefined
          if (tierKey) onToggleLayer?.(tierKey)
          return
        }
        // 列头：点击聚焦该列
        if (node.id.startsWith('arch-colhdr-')) {
          const colKey = node.id.slice('arch-colhdr-'.length)
          onFocusCol?.(colKey)
          return
        }
        return
      }
      if (node.data?.isMoreButton) {
        setExpandedGroups((prev) => {
          const next = new Set(prev)
          const isCollapse = node.data.isCollapse as boolean
          const groupKey = node.data.groupKey as string
          if (isCollapse) next.delete(groupKey)
          else next.add(groupKey)
          return next
        })
        return
      }
      onNodeSelect?.(selectedNodeId === node.id ? null : node.id)
    },
    [selectedNodeId, onNodeSelect, onToggleLayer, onFocusCol, onFocusCrossLayer],
  )

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (node.type === 'cluster' || node.data?.isMoreButton) return
      event.preventDefault()
      setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id })
    },
    [],
  )

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'cluster') return
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null }
    setHoveredNodeId(node.id)
  }, [])

  const onNodeMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = setTimeout(() => { setHoveredNodeId(null); hoverTimerRef.current = null }, 100)
  }, [])

  const onEdgeMouseEnter = useCallback((_: React.MouseEvent, edge: Edge) => {
    setHoveredEdgeId(edge.id)
  }, [])

  const onEdgeMouseLeave = useCallback(() => {
    setHoveredEdgeId(null)
  }, [])

  const onPaneClick = useCallback(() => {
    onNodeSelect?.(null)
    onEdgeSelect?.(null)
    setContextMenu(null)
  }, [onNodeSelect, onEdgeSelect])

  const contextNode = contextMenu ? nodeMap.get(contextMenu.nodeId) : null

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop} onNodeClick={onNodeClick}
        onNodeDoubleClick={(_: React.MouseEvent, node: Node) => {
          if (node.type !== 'cluster' && !node.data?.isMoreButton) onNodeFocusEgo?.(node.id)
        }}
        onNodeContextMenu={onNodeContextMenu}
        onNodeMouseEnter={onNodeMouseEnter} onNodeMouseLeave={onNodeMouseLeave}
        onEdgeMouseEnter={onEdgeMouseEnter} onEdgeMouseLeave={onEdgeMouseLeave}
        onEdgeClick={(_: React.MouseEvent, edge: Edge) =>
          onEdgeSelect?.(selectedRelationId === edge.id ? null : edge.id)
        }
        onPaneClick={onPaneClick} nodeTypes={nodeTypes}
        onInit={(instance) => { rfInstanceRef.current = instance }}
        connectionMode={ConnectionMode.Loose}
        fitView fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1} maxZoom={2}
        nodesDraggable={false} nodesConnectable={false}
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'cluster') return 'transparent'
            return LAYER_COLORS[node.data?.layer as SystemLayer] || '#ccc'
          }}
          maskColor="rgba(0,0,0,0.05)"
        />
      </ReactFlow>
      <div className="absolute top-4 right-4 z-10">
        <Legend />
      </div>

      {contextMenu && contextNode && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null) }} />
          <div
            className="fixed z-50 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl border border-gray-200/60 py-1.5 min-w-[180px] animate-in fade-in zoom-in-95 duration-150"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 200),
              top: Math.min(contextMenu.y, window.innerHeight - 260),
            }}
          >
            <div className="px-3 py-1.5 text-xs font-medium text-gray-500 border-b border-gray-100 mb-0.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm border-2 flex-shrink-0" style={{ borderColor: LAYER_COLORS[nodeLayer(contextNode) || 'infrastructure'] }} />
              {contextNode.name}
            </div>
            <button
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center gap-2"
              onClick={() => { onNodeSelect?.(contextMenu.nodeId); setContextMenu(null) }}
            >
              <span className="text-gray-400 text-xs">🔗</span>
              查看关联
            </button>
            <button
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center gap-2"
              onClick={() => { onNodeEdit?.(contextMenu.nodeId); setContextMenu(null) }}
            >
              <span className="text-gray-400 text-xs">✏️</span>
              编辑节点
            </button>
            {contextNode.links?.repo && (
              <a
                href={contextNode.links.repo}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                onClick={() => setContextMenu(null)}
              >
                <span className="text-gray-400 text-xs">📦</span>
                打开仓库
                <span className="ml-auto text-[10px] text-gray-300">↗</span>
              </a>
            )}
            {contextNode.links?.ones && (
              <a
                href={contextNode.links.ones}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                onClick={() => setContextMenu(null)}
              >
                <span className="text-gray-400 text-xs">📋</span>
                打开 ONES
                <span className="ml-auto text-[10px] text-gray-300">↗</span>
              </a>
            )}
            <div className="border-t border-gray-100 mt-0.5 pt-0.5">
              <button
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center gap-2"
                onClick={() => {
                  navigator.clipboard.writeText(contextNode!.name)
                  setContextMenu(null)
                }}
              >
                <span className="text-gray-400 text-xs">📄</span>
                复制名称
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
})

export default TopologyGraph
