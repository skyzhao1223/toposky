'use client'

import * as React from 'react'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Layout, Button, Space, Spin, message, Typography, Tooltip, Modal, Select, Segmented } from 'antd'
import {
  SettingOutlined,
  SaveOutlined,
  ReloadOutlined,
  HistoryOutlined,
  DeploymentUnitOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons'
import TopologyGraph, { EdgeMode, TopologyGraphHandle } from '@/components/TopologyGraph'
import EgoGraph from '@/components/EgoGraph'
import ConfigPanel from '@/components/ConfigPanel'
import FilterToolbar, { ClusterMode } from '@/components/FilterToolbar'
import type { ArchAxis } from '@/components/layouts'
import EnvSwitcher from '@/components/EnvSwitcher'
import VersionManager from '@/components/VersionManager'
import AuthorControl from '@/components/AuthorControl'
import { fetchTopology, saveTopology } from '@/services/topology'
import { useTopology } from '@/hooks/useTopology'
import { useAuthor } from '@/hooks/useAuthor'
import { applySaveResult } from '@/utils/saveFeedback'
import { DEMO_MODE } from '@/lib/demoMode'
import { TopologyData, SystemLayer, BusinessFlow, RelationType, EnvType, buildDomainMaps, RELATION_LABELS, CONTRACT_KIND_LABELS, CONFIDENCE_COLORS, CONFIDENCE_LABELS } from '@/types'
import { describeEvidence, confidenceUsage, EVIDENCE_CAVEAT } from '@/lib/evidence'

const { Sider, Content } = Layout
const { Title } = Typography

export default function Home() {
  const { data: shared, loading: sharedLoading } = useTopology()
  const [data, setData] = useState<TopologyData>({ nodes: [], relations: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [siderCollapsed, setSiderCollapsed] = useState(true)
  const [hasChanges, setHasChanges] = useState(false)
  const [author, updateAuthor] = useAuthor()
  const prevSharedRef = useRef<TopologyData | null>(null)

  const [selectedLayers, setSelectedLayers] = useState<SystemLayer[]>([])
  const [selectedOwners, setSelectedOwners] = useState<string[]>([])
  const [selectedRelationTypes, setSelectedRelationTypes] = useState<RelationType[]>([])
  const [searchKeyword, setSearchKeyword] = useState('')
  const [clusterMode, setClusterMode] = useState<ClusterMode>('none')
  const [archMode, setArchMode] = useState(true)
  const [archAxis, setArchAxis] = useState<ArchAxis>('businessLine')
  const [edgeMode, setEdgeMode] = useState<EdgeMode>('related')
  const [currentEnv, setCurrentEnv] = useState<EnvType>('production')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // 架构图交互状态：折叠层 / 聚焦列 / 跨层关系聚焦
  const [collapsedLayers, setCollapsedLayers] = useState<Set<SystemLayer>>(new Set())
  const [focusedCol, setFocusedCol] = useState<string | null>(null)
  const [crossLayerFocus, setCrossLayerFocus] = useState<{ from: string; to: string } | null>(null)

  // 业务流联动
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null)
  const domainMaps = useMemo(() => buildDomainMaps(data), [data])

  const [versionDrawerOpen, setVersionDrawerOpen] = useState(false)
  // 图谱上被点中的那条边：查看「这条依赖凭什么成立」
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(null)
  const [egoOpen, setEgoOpen] = useState(false)
  const [egoDepth, setEgoDepth] = useState(2)
  const [egoLayout, setEgoLayout] = useState<'direction' | 'layer'>('direction')

  const graphRef = useRef<TopologyGraphHandle>(null)
  const searchInputRef = useRef<{ focus: () => void } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const json = await fetchTopology(true)
      setData(json)
      setHasChanges(false)
    } catch {
      message.error('加载数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // 跟随共享缓存：首次加载自动填充；外部（其他页面）保存后，
  // 未脏时自动同步本地副本，已脏时提醒可能冲突（避免静默覆盖）
  useEffect(() => {
    if (sharedLoading) return
    const prev = prevSharedRef.current
    if (prev === shared) return
    prevSharedRef.current = shared
    if (hasChanges) {
      message.warning('数据已被其他页面更新并保存，你的未保存修改基于旧版本，保存时可能冲突')
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 同步外部共享数据到本地编辑副本
      setData(shared)
      setLoading(false)
    }
  }, [shared, sharedLoading, hasChanges])

  const filteredData = useMemo(() => {
    let nodes = data.nodes
    let relations = data.relations

    if (selectedLayers.length > 0) {
      nodes = nodes.filter((n) => n.layer && selectedLayers.includes(n.layer))
    }

    if (selectedOwners.length > 0) {
      nodes = nodes.filter((n) => n.owner && selectedOwners.includes(n.owner))
    }

    const nodeIds = new Set(nodes.map((n) => n.id))
    relations = relations.filter((r) => nodeIds.has(r.source) && nodeIds.has(r.target))

    if (selectedRelationTypes.length > 0) {
      relations = relations.filter((r) => selectedRelationTypes.includes(r.relationType))
    }

    return { ...data, nodes, relations }
  }, [data, selectedLayers, selectedOwners, selectedRelationTypes])

  const searchMatchIds = useMemo(() => {
    if (!searchKeyword) return null
    const kw = searchKeyword.toLowerCase()
    const ids = new Set<string>()
    filteredData.nodes.forEach((n) => {
      if (
        n.name.toLowerCase().includes(kw) ||
        n.description.toLowerCase().includes(kw) ||
        (n.owner && n.owner.toLowerCase().includes(kw)) ||
        n.id.toLowerCase().includes(kw)
      ) ids.add(n.id)
    })
    return ids
  }, [searchKeyword, filteredData.nodes])

  const handleReload = useCallback(() => {
    setHasChanges(false)
    fetchData()
  }, [fetchData])

  const handleSave = useCallback(async () => {
    if (DEMO_MODE) {
      message.warning('演示模式为只读：请在本地运行 npm run dev 后编辑。')
      return
    }
    setSaving(true)
    try {
      const result = await saveTopology(data, {
        author: author.name || undefined,
        email: author.email || undefined,
        message: '更新系统拓扑',
      })
      if (applySaveResult(result, { onReload: handleReload })) {
        setHasChanges(false)
      }
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }, [data, author, handleReload])

  const handleDataChange = (newData: TopologyData) => {
    setData(newData)
    setHasChanges(true)
  }

  const handleNodePositionChange = (nodeId: string, position: { x: number; y: number }) => {
    setData((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, position } : n)),
    }))
    setHasChanges(true)
  }

  const handleVersionRestore = useCallback((restoredData: unknown) => {
    setData(restoredData as TopologyData)
    setHasChanges(false)
  }, [])

  const handleLocateNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId)
    graphRef.current?.centerNode(nodeId)
  }, [])

  useEffect(() => {
    if (!hasChanges) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasChanges])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (e.key === 'Escape') {
        setSelectedNodeId(null)
        setSearchKeyword('')
      } else if (mod && e.key === 's') {
        e.preventDefault()
        if (hasChanges) handleSave()
      } else if (mod && e.key === 'f') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [hasChanges, handleSave])

  return (
    <Layout className="h-screen">
      <div className="!h-auto !p-0 bg-white border-b border-gray-200 !leading-normal">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 text-xs">
                <DeploymentUnitOutlined />
              </div>
              <Title level={5} className="!mb-0 !text-gray-800 !text-[14px]">
                系统拓扑
              </Title>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                {filteredData.nodes.length} 系统
              </span>
              <span className="bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                {filteredData.relations.length} 关系
              </span>
            </div>
            {selectedNodeId && (
              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 flex items-center gap-1 animate-in fade-in">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                {data.nodes.find((n) => n.id === selectedNodeId)?.name}
                <span className="ml-0.5 cursor-pointer text-blue-300 hover:text-blue-600 transition-colors" onClick={() => setSelectedNodeId(null)}>✕</span>
              </span>
            )}
            {hasChanges && (
              <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse" />
                未保存
              </span>
            )}
          </div>
          <Space size={8} className="flex-shrink-0">
            <EnvSwitcher currentEnv={currentEnv} onChange={setCurrentEnv} />
            <div className="w-px h-5 bg-gray-200" />
            {selectedNodeId && (
              <Tooltip title="把该系统的上下游单独拎出来，分层清晰展示（也可双击节点）">
                <Button type="primary" icon={<NodeIndexOutlined />} onClick={() => setEgoOpen(true)} size="small">
                  上下游聚焦
                </Button>
              </Tooltip>
            )}
            {!DEMO_MODE && (
              <Tooltip title="版本管理">
                <Button icon={<HistoryOutlined />} onClick={() => setVersionDrawerOpen(true)} size="small" />
              </Tooltip>
            )}
            <Tooltip title="刷新数据">
              <Button icon={<ReloadOutlined />} onClick={fetchData} size="small" />
            </Tooltip>
            {!DEMO_MODE && <AuthorControl author={author} onChange={updateAuthor} />}
            <Tooltip title={DEMO_MODE ? '演示模式为只读' : '保存 (⌘S)'}>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={saving}
                disabled={!hasChanges || DEMO_MODE}
                size="small"
              >
                保存
              </Button>
            </Tooltip>
            <div className="w-px h-5 bg-gray-200" />
            <Tooltip title={siderCollapsed ? '打开配置面板' : '收起配置面板'}>
              <Button
                icon={<SettingOutlined />}
                onClick={() => setSiderCollapsed(!siderCollapsed)}
                size="small"
                type={siderCollapsed ? 'default' : 'primary'}
                ghost={!siderCollapsed}
              />
            </Tooltip>
          </Space>
        </div>
        <div className="px-5 py-2 bg-[#fafbfc] border-b border-gray-100">
          <FilterToolbar
            data={data}
            selectedLayers={selectedLayers}
            onLayerChange={setSelectedLayers}
            selectedOwners={selectedOwners}
            onOwnerChange={setSelectedOwners}
            searchKeyword={searchKeyword}
            onSearchChange={setSearchKeyword}
            clusterMode={clusterMode}
            onClusterModeChange={setClusterMode}
            edgeMode={edgeMode}
            onEdgeModeChange={setEdgeMode}
            selectedRelationTypes={selectedRelationTypes}
            onRelationTypeChange={setSelectedRelationTypes}
            archMode={archMode}
            onArchModeChange={setArchMode}
            archAxis={archAxis}
            onArchAxisChange={setArchAxis}
          />
        </div>
        <div className="px-5 py-2 border-t border-gray-100 flex items-start gap-2">
          <span className="text-xs text-gray-400 flex-shrink-0 flex items-center gap-1 mt-1">
            <span className="text-blue-500">◈</span>业务流
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              className={`px-2.5 py-1 rounded-md text-xs transition-all ${!activeFlowId ? 'bg-blue-500 text-white shadow-sm font-medium' : 'text-gray-600 bg-white border border-gray-200 hover:border-blue-300 hover:text-blue-500'}`}
              onClick={() => { setActiveFlowId(null); setSelectedNodeId(null) }}
            >
              全部
            </button>
            {domainMaps.order.map((dom) => {
              const domainFlows = (data.businessFlows || []).filter((f) => f.domain === dom)
              if (domainFlows.length === 0) return null
              return (
                <div key={dom} className="flex items-center gap-1.5">
                  <span className="px-2 py-1 rounded-md text-[10px] font-medium flex items-center gap-1" style={{ color: domainMaps.colors[dom], backgroundColor: `${domainMaps.colors[dom]}12`, border: `1px solid ${domainMaps.colors[dom]}30` }}>
                    {domainMaps.labels[dom]}
                  </span>
                  {domainFlows.map((f: BusinessFlow) => (
                    <button
                      key={f.id}
                      className={`px-2.5 py-1 rounded-md text-xs transition-all ${activeFlowId === f.id ? 'shadow-sm font-medium' : 'text-gray-600 bg-white border border-gray-200 hover:border-blue-300 hover:text-blue-500'}`}
                      style={activeFlowId === f.id ? { backgroundColor: domainMaps.colors[dom], color: '#fff' } : undefined}
                      onClick={() => { setActiveFlowId(f.id); setSelectedNodeId(null) }}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <Layout className="relative">
        <Content className="relative overflow-hidden">
          {loading ? (
            <Spin size="large" description="加载中...">
              <div className="flex items-center justify-center h-full min-h-[400px]" />
            </Spin>
          ) : (
            <>
              <TopologyGraph
                ref={graphRef}
                data={filteredData}
                clusterMode={clusterMode}
                archMode={archMode}
                archAxis={archAxis}
                edgeMode={edgeMode}
                currentEnv={currentEnv}
                searchMatchIds={searchMatchIds}
                onNodePositionChange={handleNodePositionChange}
                selectedNodeId={selectedNodeId}
                onNodeSelect={(id) => { setSelectedNodeId(id); if (id) setSiderCollapsed(false); setSelectedRelationId(null) }}
                selectedRelationId={selectedRelationId}
                onEdgeSelect={setSelectedRelationId}
                collapsedLayers={collapsedLayers}
                focusedCol={focusedCol}
                onToggleLayer={(layer) => {
                  setCollapsedLayers((prev) => {
                    const next = new Set(prev)
                    if (next.has(layer)) next.delete(layer)
                    else next.add(layer)
                    return next
                  })
                  setSelectedNodeId(null)
                }}
                onFocusCol={(colKey) => {
                  setFocusedCol((prev) => (prev === colKey ? null : colKey))
                  setSelectedNodeId(null)
                }}
                crossLayerFocus={crossLayerFocus}
                onFocusCrossLayer={(from, to) => {
                  setCrossLayerFocus((prev) =>
                    prev && prev.from === from && prev.to === to ? null : { from, to },
                  )
                  setSelectedNodeId(null)
                }}
                activeFlowId={activeFlowId}
                onNodeEdit={(nodeId) => {
                  const node = data.nodes.find((n) => n.id === nodeId)
                  if (node) { setSiderCollapsed(false) }
                }}
                onNodeFocusEgo={(id) => { setSelectedNodeId(id); setEgoOpen(true) }}
              />
              {(() => {
                const flow = (data.businessFlows || []).find((f: BusinessFlow) => f.id === activeFlowId)
                if (!flow) return null
                const nodeName = (id: string) => data.nodes.find((n) => n.id === id)?.name || id
                return (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-white/95 backdrop-blur rounded-xl shadow-lg border border-gray-200 px-4 py-3 max-w-[90%]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-gray-700">◈ {flow.name}</span>
                      <span className="text-[10px] text-gray-400">{flow.description}</span>
                      <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-100">{flow.steps.length} 步</span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {flow.steps.map((s, i) => (
                        <React.Fragment key={s.nodeId + i}>
                          <button
                            className="group flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300"
                            onClick={() => handleLocateNode(s.nodeId)}
                          >
                            <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                              {i + 1}
                            </span>
                            <span className="text-gray-700 group-hover:text-blue-600">{nodeName(s.nodeId)}</span>
                            <span className="text-[10px] text-gray-400 hidden md:inline">{s.label}</span>
                          </button>
                          {i < flow.steps.length - 1 && <span className="text-gray-300 text-xs">→</span>}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </>
          )}
        </Content>
        <Sider
          width={480}
          theme="light"
          collapsed={siderCollapsed}
          collapsedWidth={0}
          className="border-l border-gray-200 !transition-all !duration-300 !ease-in-out overflow-hidden shadow-[-2px_0_8px_rgba(0,0,0,0.04)]"
        >
          <div className="h-full flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <span className="font-medium text-sm text-gray-700">配置管理</span>
              <Button
                type="text"
                size="small"
                icon={<SettingOutlined />}
                onClick={() => setSiderCollapsed(true)}
                className="text-gray-400 hover:text-gray-600"
              />
            </div>
            <div className="flex-1 min-h-0 p-4 overflow-y-auto">
              <ConfigPanel
                data={data}
                onChange={handleDataChange}
                selectedNodeId={selectedNodeId}
                onLocateNode={handleLocateNode}
                onFocusEgo={(id) => { setSelectedNodeId(id); setEgoOpen(true) }}
              />
            </div>
          </div>
        </Sider>
      </Layout>
      {!DEMO_MODE && (
        <VersionManager
          open={versionDrawerOpen}
          onClose={() => setVersionDrawerOpen(false)}
          hasChanges={hasChanges}
          onRestore={handleVersionRestore}
        />
      )}

      <Modal
        open={egoOpen}
        onCancel={() => setEgoOpen(false)}
        footer={null}
        width="92vw"
        title={
          <span className="flex items-center gap-2">
            <NodeIndexOutlined className="text-blue-600" />
            上下游聚焦
            <span className="text-gray-400 font-normal text-[13px]">
              {data.nodes.find((n) => n.id === selectedNodeId)?.name || selectedNodeId}
            </span>
            <Select
              size="small"
              value={egoDepth}
              onChange={setEgoDepth}
              className="!w-24 ml-2"
              options={[
                { value: 1, label: '1 层' },
                { value: 2, label: '2 层' },
                { value: 3, label: '3 层' },
              ]}
            />
            <Segmented
              size="small"
              className="ml-1"
              value={egoLayout}
              onChange={(v) => setEgoLayout(v as 'direction' | 'layer')}
              options={[
                { value: 'direction', label: '上下游方向' },
                { value: 'layer', label: '架构分层' },
              ]}
            />
            <span className="text-[11px] text-gray-400 font-normal ml-1">
              橙=上游依赖 · 绿=下游影响
            </span>
          </span>
        }
        styles={{ body: { padding: 0, height: '74vh' } }}
      >
        {egoOpen && selectedNodeId && (
          <EgoGraph data={data} focusId={selectedNodeId} depth={egoDepth} layout={egoLayout} onNodeClick={setSelectedNodeId} />
        )}
      </Modal>
      <Modal
        open={Boolean(selectedRelationId)}
        onCancel={() => setSelectedRelationId(null)}
        footer={null}
        width={620}
        title={<span className="text-[13px]">这条依赖凭什么成立</span>}
      >
        {(() => {
          const rel = data.relations.find((r) => r.id === selectedRelationId)
          if (!rel) return null
          const ev = describeEvidence(rel)
          const nodeName = (id: string) => data.nodes.find((n) => n.id === id)?.name || id
          return (
            <div className="space-y-3 text-[13px]">
              <div className="text-gray-800">
                <span className="font-medium">{nodeName(rel.source)}</span>
                <span className="mx-1 text-gray-300">→</span>
                <span className="font-medium">{nodeName(rel.target)}</span>
                <span className="ml-2 text-[11px] text-gray-400">{rel.id} · {RELATION_LABELS[rel.relationType]}</span>
              </div>
              <div className="text-[12px] text-gray-600">
                契约：
                {rel.contract?.kind
                  ? CONTRACT_KIND_LABELS[rel.contract.kind] + (rel.contract.target ? '：' + rel.contract.target : '（仅类型，未定位到接口）')
                  : '未填'}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: CONFIDENCE_COLORS[ev.confidence] }} />
                <span style={{ color: CONFIDENCE_COLORS[ev.confidence] }}>可信度 {CONFIDENCE_LABELS[ev.confidence]}</span>
                <span className="text-[11px] text-gray-400">{confidenceUsage(ev.confidence)}</span>
                {!ev.verified && <span className="text-orange-500 text-[11px]">未核实</span>}
              </div>
              <div className="bg-gray-50 rounded p-3 space-y-1">
                <div className="text-gray-700">{ev.headline}</div>
                <div className="text-[11px] text-gray-500">
                  证据类型：{ev.kindLabel || '（无来源标注）'}
                  {ev.verdictLabel ? ' · 核实结论：' + ev.verdictLabel : ''}
                </div>
                {ev.ref && <div className="text-[11px] text-gray-500">出处：<code>{ev.ref}</code></div>}
                {ev.note && <div className="text-[11px] text-gray-400">{ev.note}</div>}
              </div>
              <div className="text-[11px] text-gray-400">{EVIDENCE_CAVEAT}</div>
            </div>
          )
        })()}
      </Modal>
    </Layout>
  )
}
