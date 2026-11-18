'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, Tag, Typography, Spin, Empty, Input, Tooltip } from 'antd'
import {
  ArrowRightOutlined,
  SearchOutlined,
  UserOutlined,
  LinkOutlined,
  ApartmentOutlined,
  FieldTimeOutlined,
  RocketOutlined,
  FlagOutlined,
} from '@ant-design/icons'
import {
  BusinessFlow,
  Criticality,
  buildBusinessLineMaps,
  buildDomainMaps,
  CRITICALITY_COLORS,
  LAYER_LABELS,
  LAYER_COLORS,
  nodeLayer,
  processDomainColor,
} from '@/types'
import { useTopology } from '@/hooks/useTopology'

const { Title, Paragraph } = Typography

const CRIT_ORDER: Criticality[] = ['P0', 'P1', 'P2', 'P3']

function FlowCard({ f, active, color, onClick }: { f: BusinessFlow; active: boolean; color: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`group relative flex flex-col gap-1 rounded-xl border px-3 py-2.5 cursor-pointer transition-all duration-150 ${
        active
          ? 'bg-white border-gray-200 shadow-sm'
          : 'border-transparent hover:bg-white hover:border-gray-200 hover:shadow-sm'
      }`}
    >
      <span
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full transition-all duration-150"
        style={{
          backgroundColor: active ? color : 'transparent',
          boxShadow: active ? `0 0 6px ${color}66` : 'none',
        }}
      />
      <div className="flex items-center gap-1.5">
        <span
          className={`text-[13px] truncate ${active ? 'font-semibold' : 'font-medium text-gray-700 group-hover:text-gray-900'}`}
          style={active ? { color } : undefined}
        >
          {f.name}
        </span>
        {f.criticality && (
          <span
            className="ml-auto flex-shrink-0 text-[9px] font-semibold px-1.5 py-px rounded-md leading-[14px]"
            style={{
              color: CRITICALITY_COLORS[f.criticality],
              backgroundColor: `${CRITICALITY_COLORS[f.criticality]}14`,
              border: `1px solid ${CRITICALITY_COLORS[f.criticality]}30`,
            }}
          >
            {f.criticality}
          </span>
        )}
      </div>
      <div className="text-[11px] text-gray-400 leading-snug line-clamp-1">{f.description}</div>
      <div className="flex items-center gap-2.5 text-[10px] text-gray-400 mt-0.5">
        <span className="flex items-center gap-1">
          <LinkOutlined className="text-[9px]" />
          {f.steps.length} 步
        </span>
        {f.owner && (
          <span className="flex items-center gap-1 truncate">
            <UserOutlined className="text-[9px]" />
            {f.owner}
          </span>
        )}
      </div>
    </div>
  )
}

export function BusinessFlowsView() {
  const searchParams = useSearchParams()
  const { data, loading } = useTopology()
  const domainMaps = useMemo(() => buildDomainMaps(data), [data])
  const blMaps = useMemo(() => buildBusinessLineMaps(data), [data])
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [critFilter, setCritFilter] = useState<Criticality | undefined>()

  const flows = useMemo(() => data.businessFlows || [], [data.businessFlows])

  useEffect(() => {
    const f = searchParams.get('flow')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 订阅外部导航状态是必要同步 setState
    if (f && flows.length > 0) setActiveFlowId(f)
  }, [searchParams, flows.length])

  const nodeMap = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes])

  // 反向映射：业务流 -> 支撑它的流程目录流程
  const processByFlow = useMemo(() => {
    const m = new Map<string, { id: string; name: string; domainId: string; domainName: string; groupName: string }[]>()
    const pc = data.processCatalog
    if (pc) {
      pc.domains.forEach((dom) =>
        dom.groups.forEach((g) =>
          g.processes.forEach((p) => {
            ;(p.flows || []).forEach((fid) => {
              if (!m.has(fid)) m.set(fid, [])
              m.get(fid)!.push({ id: p.id, name: p.name, domainId: dom.id, domainName: dom.name, groupName: g.name })
            })
          }),
        ),
      )
    }
    return m
  }, [data.processCatalog])

  const filteredFlows = useMemo(() => {
    const kw = search.trim().toLowerCase()
    return flows.filter((f) => {
      if (critFilter && f.criticality !== critFilter) return false
      if (!kw) return true
      return (
        f.name.toLowerCase().includes(kw) ||
        f.description.toLowerCase().includes(kw) ||
        (f.owner || '').toLowerCase().includes(kw) ||
        (f.businessLine || '').toLowerCase().includes(kw) ||
        (f.domain && (domainMaps.labels[f.domain] || '').includes(kw))
      )
    })
  }, [flows, search, critFilter, domainMaps])

  const activeFlow = flows.find((f) => f.id === activeFlowId) || flows[0] || null
  const activeColor = activeFlow?.domain ? domainMaps.colors[activeFlow.domain] || '#2563eb' : '#2563eb'

  const groupedFlows = useMemo(() => {
    return domainMaps.order
      .map((dom) => ({ dom, items: filteredFlows.filter((f) => f.domain === dom) }))
      .filter((g) => g.items.length > 0)
  }, [filteredFlows, domainMaps])

  const critCounts = useMemo(() => {
    const map: Partial<Record<Criticality, number>> = {}
    flows.forEach((f) => { if (f.criticality) map[f.criticality] = (map[f.criticality] || 0) + 1 })
    return map
  }, [flows])

  if (loading) return <div className="h-full flex items-center justify-center"><Spin size="large" description="加载中..." /></div>

  return (
    <div className="flex h-full bg-[#f6f7f9]">
      {/* ============ 左侧业务流列表 ============ */}
      <aside className="w-80 border-r border-gray-200 bg-white flex flex-col flex-shrink-0">
        {/* 头部：标题 + 搜索 */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <ApartmentOutlined />
              </span>
              <span className="font-semibold text-[14px] text-gray-800">业务流</span>
            </div>
            <span className="text-[10px] text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
              {flows.length} 条
            </span>
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索名称 / 描述 / 负责人"
            allowClear
            prefix={<SearchOutlined className="text-gray-400" />}
            size="small"
          />
        </div>

        {/* 关键等级筛选 chips */}
        <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-1 border-b border-gray-50">
          <button
            onClick={() => setCritFilter(undefined)}
            className={`text-[11px] px-2 py-1 rounded-full border transition-all ${
              !critFilter
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}
          >
            全部<span className={`ml-1 text-[9px] ${!critFilter ? 'opacity-70' : 'text-gray-400'}`}>{flows.length}</span>
          </button>
          {CRIT_ORDER.map((c) => (
            <button
              key={c}
              onClick={() => setCritFilter(critFilter === c ? undefined : c)}
              className={`text-[11px] px-2 py-1 rounded-full border transition-all ${
                critFilter === c
                  ? 'border-transparent text-white'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
              style={critFilter === c ? { backgroundColor: CRITICALITY_COLORS[c] } : undefined}
            >
              {c}
              <span className={`ml-1 text-[9px] ${critFilter === c ? 'opacity-70' : 'text-gray-400'}`}>
                {critCounts[c] || 0}
              </span>
            </button>
          ))}
        </div>

        {/* 分组列表 */}
        <div className="flex-1 overflow-y-auto px-3 py-1">
          {groupedFlows.length === 0 ? (
            <div className="pt-16">
              <Empty description="没有匹配的业务流" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          ) : (
            groupedFlows.map(({ dom, items }) => (
              <div key={dom} className="mb-1">
                <div className="flex items-center gap-1.5 px-1 pt-3 pb-1">
                  <span className="w-1.5 h-3.5 rounded-full" style={{ backgroundColor: domainMaps.colors[dom] }} />
                  <span className="text-[12px] font-semibold" style={{ color: domainMaps.colors[dom] }}>
                    {domainMaps.labels[dom]}
                  </span>
                  <span className="text-[10px] text-gray-400 ml-auto">{items.length} 条</span>
                </div>
                <div className="space-y-0.5">
                  {items.map((f) => (
                    <FlowCard
                      key={f.id}
                      f={f}
                      active={activeFlow?.id === f.id}
                      color={domainMaps.colors[f.domain || ''] || '#8c8c8c'}
                      onClick={() => setActiveFlowId(f.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ============ 右侧业务流详情 ============ */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeFlow ? (
          <div className="max-w-5xl mx-auto">
            {/* 头部卡片（域色装饰背景） */}
            <div className="relative mb-4 rounded-2xl border border-gray-200 bg-white p-5 overflow-hidden">
              <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full" style={{ backgroundColor: `${activeColor}0F` }} />
              <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full" style={{ backgroundColor: `${activeColor}0A` }} />
              <div className="relative">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <Title level={4} className="!mb-0">
                    {activeFlow.name}
                  </Title>
                  {activeFlow.domain && (
                    <Tag color={activeColor} className="!mr-0">{domainMaps.labels[activeFlow.domain] || '未分类'}</Tag>
                  )}
                  {activeFlow.criticality && (
                    <Tag color={CRITICALITY_COLORS[activeFlow.criticality]} className="!mr-0">
                      {activeFlow.criticality}
                    </Tag>
                  )}
                </div>
                <Paragraph type="secondary" className="!mb-0 text-[13px] max-w-2xl">
                  {activeFlow.description}
                </Paragraph>
              </div>
            </div>

            {/* 支撑的业务流程（三层链路：流程目录 → 业务流 → 系统） */}
            {(() => {
              const procs = activeFlow ? processByFlow.get(activeFlow.id) || [] : []
              if (procs.length === 0) return null
              return (
                <Card
                  size="small"
                  className="!mb-4"
                  title={
                    <span className="flex items-center gap-2 text-[13px] font-medium text-gray-700">
                      <ApartmentOutlined />
                      支撑的业务流程（流程目录）
                      <span className="text-[11px] text-gray-400 font-normal">— 这 {procs.length} 个流程组合起来，构成这条端到端业务流</span>
                    </span>
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {procs.map((p) => (
                      <a
                        key={p.id}
                        href={`/processes?process=${p.id}`}
                        className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] font-medium transition-all hover:shadow-sm"
                        style={{
                          borderColor: `${processDomainColor(p.domainId, domainMaps.colors)}55`,
                          backgroundColor: `${processDomainColor(p.domainId, domainMaps.colors)}0D`,
                          color: processDomainColor(p.domainId, domainMaps.colors),
                        }}
                      >
                        <span className="w-1.5 h-3.5 rounded-full" style={{ backgroundColor: processDomainColor(p.domainId, domainMaps.colors) }} />
                        {p.name}
                        <span className="text-[10px] text-gray-400 group-hover:text-gray-500">({p.domainName} · {p.groupName})</span>
                      </a>
                    ))}
                  </div>
                  <div className="mt-2.5 text-[11px] text-gray-400 flex items-center gap-1.5">
                    <span className="text-gray-500">点击可跳回「流程目录」查看该流程详情 ↓</span>
                    <span className="text-gray-300">｜</span>
                    下方「流程编排」按系统节点展示这条业务流经过的具体系统
                  </div>
                </Card>
              )
            })()}

            {/* 流程元信息 */}
            <Card size="small" className="!mb-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                <div>
                  <div className="text-[10px] text-gray-400 mb-1">业务域</div>
                  <div className="text-[12px] text-gray-700 font-medium">
                    {activeFlow.domain ? domainMaps.labels[activeFlow.domain] || '未分类' : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 mb-1">负责人</div>
                  <div className="text-[12px] text-gray-700 font-medium">{activeFlow.owner || '-'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 mb-1">关键等级</div>
                  {activeFlow.criticality ? (
                    <span
                      className="inline-block text-[11px] font-semibold px-1.5 py-px rounded-md"
                      style={{
                        color: CRITICALITY_COLORS[activeFlow.criticality],
                        backgroundColor: `${CRITICALITY_COLORS[activeFlow.criticality]}14`,
                      }}
                    >
                      {activeFlow.criticality}
                    </span>
                  ) : (
                    <div className="text-[12px] text-gray-700 font-medium">-</div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 mb-1">触发方式</div>
                  <div className="text-[12px] text-gray-700 font-medium">{activeFlow.trigger || '-'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 mb-1">流程指标</div>
                  <div className="text-[12px] text-gray-700 font-medium">{activeFlow.kpi || '-'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 mb-1">主责业务线</div>
                  <div className="text-[12px] text-gray-700 font-medium">{activeFlow.businessLine ? (blMaps.labels[activeFlow.businessLine] || activeFlow.businessLine) : '-'}</div>
                </div>
              </div>
            </Card>

            {/* 步骤泳道 */}
            <Card
              size="small"
              className="!mb-0"
              title={
                <span className="flex items-center gap-2 text-[13px] font-medium text-gray-700">
                  <RocketOutlined />
                  流程编排
                  <span className="text-[11px] text-gray-400 font-normal">
                    {activeFlow.steps.length} 个节点 · {activeFlow.steps.filter((s) => nodeMap.has(s.nodeId)).length} 个系统
                  </span>
                </span>
              }
              extra={
                activeFlow.trigger && (
                  <Tooltip title="触发方式">
                    <span className="text-[11px] text-gray-400 flex items-center gap-1">
                      <FlagOutlined /> {activeFlow.trigger}
                    </span>
                  </Tooltip>
                )
              }
            >
              <div className="flex items-stretch overflow-x-auto py-2 -mx-1 px-1">
                {activeFlow.steps.map((s, i) => {
                  const node = nodeMap.get(s.nodeId)
                  const color = node ? (LAYER_COLORS[nodeLayer(node) || 'application'] || '#94a3b8') : '#94a3b8'
                  const isLast = i === activeFlow.steps.length - 1
                  return (
                    <div key={s.nodeId + i} className="flex items-stretch">
                      <div className="w-52 flex-shrink-0 flex flex-col">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className="w-6 h-6 rounded-full text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: color, boxShadow: `0 0 0 3px ${color}1F` }}
                          >
                            {i + 1}
                          </span>
                          <span className="text-[12px] font-medium text-gray-700 truncate">{s.label}</span>
                        </div>
                        <div
                          className="flex-1 min-h-[88px] rounded-xl border bg-white p-3 transition-all duration-150 hover:shadow-md"
                          style={{ borderColor: `${color}55` }}
                        >
                          <div className="text-[13px] font-semibold" style={{ color }}>
                            {node?.name || s.nodeId}
                          </div>
                          <div className="text-[11px] text-gray-400 mt-0.5 leading-snug line-clamp-2">
                            {node?.description || ''}
                          </div>
                          <div className="mt-2">
                            {node && nodeLayer(node) && (
                              <Tag
                                className="!text-[10px] !py-0"
                                style={{ color, backgroundColor: `${color}14`, borderColor: `${color}30` }}
                              >
                                {LAYER_LABELS[nodeLayer(node)!]}
                              </Tag>
                            )}
                          </div>
                        </div>
                      </div>
                      {!isLast && (
                        <div className="w-8 flex items-center justify-center flex-shrink-0 text-gray-300">
                          <div className="relative w-full flex items-center">
                            <div className="absolute h-px bg-gray-200 w-full" />
                            <ArrowRightOutlined className="relative text-[10px] mx-auto" />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Card>

            <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
              <FieldTimeOutlined />
              {activeFlow.kpi ? `流程指标：${activeFlow.kpi}` : '暂无流程指标'}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <Empty description="选择左侧业务流查看编排" />
          </div>
        )}
      </div>
    </div>
  )
}
