'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Input, Spin, Empty, Tree, Tag, Typography, Tooltip, Tabs } from 'antd'
import type { DataNode } from 'antd/es/tree'
import { SearchOutlined, ApartmentOutlined, LinkOutlined, ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons'
import type { ProcessCatalog, ProcessInfo, ProcessHost } from '@/types'
import { buildDomainMaps, buildProcessHostMaps } from '@/types'
import { useTopology } from '@/hooks/useTopology'
import ProcessGraph from '@/components/ProcessGraph'
import { BusinessFlowsView } from '@/components/BusinessFlowsView'

const { Title } = Typography

function buildTreeData(
  catalog: ProcessCatalog,
  keyword: string,
  hostFilter: ProcessHost | 'all' | 'unknown',
  hostColors: Record<string, string>,
  domainColors: Record<string, string>,
): DataNode[] {
  const kw = keyword.trim().toLowerCase()
  const hit = (p: ProcessInfo) =>
    !kw ||
    p.name.toLowerCase().includes(kw) ||
    (p.nameEn || '').toLowerCase().includes(kw) ||
    (p.desc || '').toLowerCase().includes(kw)
  const hostOk = (p: ProcessInfo) =>
    hostFilter === 'all' || p.host === hostFilter || (hostFilter === 'unknown' && !p.host)
  return catalog.domains.flatMap((dom) => {
    const children = dom.groups.flatMap((g) => {
      const procs = g.processes.filter((p) => hit(p) && hostOk(p))
      if (procs.length === 0) return []
      return [{
        key: g.id,
        title: (
          <span className="text-[12px] text-gray-600 font-medium">
            {g.name}
            <span className="text-[10px] text-gray-400 ml-1">{procs.length}</span>
          </span>
        ),
        selectable: false,
        children: procs.map((p) => ({
          key: p.id,
          title: (
            <span className="text-[12px] flex items-center gap-1.5">
              {p.host && (
                <span
                  className="w-2 h-2 rounded-sm inline-block flex-shrink-0"
                  style={{ backgroundColor: hostColors[p.host] || '#6b7280' }}
                />
              )}
              <span className="truncate">{p.name}</span>
              {p.systems?.length ? (
                <span className="ml-0.5 text-[9px] text-green-600 bg-green-50 px-1 rounded flex-shrink-0">S</span>
              ) : null}
            </span>
          ),
          isLeaf: true,
        })),
      }]
    })
    if (children.length === 0) return []
    return [{
      key: dom.id,
      title: (
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: domainColors[dom.id] || '#6b7280' }} />
          <span className="text-[13px] font-semibold">{dom.name}</span>
          <span className="text-[10px] text-gray-400 ml-1">{children.length} 组</span>
        </span>
      ),
      selectable: false,
      children,
    }]
  })
}

function CatalogView() {
  const searchParams = useSearchParams()
  const { data, loading } = useTopology()
  const [search, setSearch] = useState('')
  const [hostFilter, setHostFilter] = useState<ProcessHost | 'all' | 'unknown'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
  const [showAll, setShowAll] = useState(true)

  const catalog = useMemo(() => data.processCatalog || { domains: [], dependencies: [] }, [data.processCatalog])
  const hostMaps = useMemo(() => buildProcessHostMaps(data), [data])
  const domainMaps = useMemo(() => buildDomainMaps(data), [data])
  const processById = useMemo(() => {
    const m = new Map<string, { p: ProcessInfo; group: { id: string; name: string }; domain: { id: string; name: string } }>()
    catalog.domains.forEach((dom) =>
      dom.groups.forEach((g) =>
        g.processes.forEach((p) => m.set(p.id, { p, group: { id: g.id, name: g.name }, domain: { id: dom.id, name: dom.name } })),
      ),
    )
    return m
  }, [catalog])
  const nodeMap = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes])
  const flowById = useMemo(() => new Map((data.businessFlows || []).map((f) => [f.id, f])), [data.businessFlows])

  useEffect(() => {
    const f = searchParams.get('process')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 订阅外部导航状态是必要同步 setState
    if (f && processById.has(f)) setSelectedId(f)
  }, [searchParams, processById])

  // 选中流程时自动展开其在树中的祖先（板块 → 流程组）
  useEffect(() => {
    if (!selectedId) return
    const info = processById.get(selectedId)
    if (!info) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 同步外部选中到树展开是必要状态同步
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      next.add(info.domain.id)
      next.add(info.group.id)
      return Array.from(next)
    })
  }, [selectedId, processById])

  const hostCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, unknown: 0 }
    hostMaps.hosts.forEach((h) => { counts[h.id] = 0 })
    catalog.domains.forEach((d) =>
      d.groups.forEach((g) =>
        g.processes.forEach((p) => {
          counts.all++
          if (p.host) counts[p.host] = (counts[p.host] || 0) + 1
          else counts.unknown++
        }),
      ),
    )
    return counts
  }, [catalog, hostMaps])

  const visibleCount = useMemo(() => {
    const kw = search.trim().toLowerCase()
    let n = 0
    catalog.domains.forEach((d) =>
      d.groups.forEach((g) =>
        g.processes.forEach((p) => {
          if (hostFilter !== 'all' && !(p.host === hostFilter || (hostFilter === 'unknown' && !p.host))) return
          if (kw && !(p.name.toLowerCase().includes(kw) || (p.nameEn || '').toLowerCase().includes(kw) || (p.desc || '').toLowerCase().includes(kw))) return
          n++
        }),
      ),
    )
    return n
  }, [catalog, hostFilter, search])

  const treeData = useMemo(
    () => buildTreeData(catalog, search, hostFilter, hostMaps.colors, domainMaps.colors),
    [catalog, search, hostFilter, hostMaps, domainMaps],
  )

  useEffect(() => {
    if (search) {
      const keys: React.Key[] = []
      const collect = (nodes: DataNode[]) => nodes.forEach((n) => { keys.push(n.key); if (n.children) collect(n.children) })
      collect(treeData)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 搜索时展开全部匹配节点是必要的同步
      setExpandedKeys(keys)
    }
  }, [search, treeData])

  const totalProcesses = useMemo(() => catalog.domains.reduce((s, d) => s + d.groups.reduce((s2, g) => s2 + g.processes.length, 0), 0), [catalog])
  const linkedCount = useMemo(
    () => catalog.domains.reduce((s, d) => s + d.groups.reduce((s2, g) => s2 + g.processes.filter((p) => p.systems?.length).length, 0), 0),
    [catalog],
  )

  if (loading) return <div className="h-full flex items-center justify-center"><Spin size="large" description="加载中..." /></div>

  const sel = selectedId ? processById.get(selectedId) : null
  const deps = catalog.dependencies
  const outDeps = selectedId ? deps.filter((x) => x.from === selectedId) : []
  const inDeps = selectedId ? deps.filter((x) => x.to === selectedId) : []
  const selColor = sel ? domainMaps.colors[sel.domain.id] || '#2563eb' : '#2563eb'

  const depItem = (dep: { from: string; to: string; type?: string; note?: string }, dir: 'out' | 'in') => {
    const otherId = dir === 'out' ? dep.to : dep.from
    const other = processById.get(otherId)
    return (
      <div
        key={`${dep.from}-${dep.to}-${dir}`}
        onClick={() => setSelectedId(otherId)}
        className="rounded-lg border px-3 py-2 cursor-pointer transition-all hover:shadow-sm"
        style={{
          borderColor: dir === 'out' ? '#d3f2e2' : '#f8e9cd',
          background: dir === 'out' ? '#f2fbf6' : '#fdf8f0',
        }}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold" style={{ color: dir === 'out' ? '#1fbf75' : '#f59a23' }}>
            {dir === 'out' ? '▼' : '▲'}
          </span>
          <span className="text-[12px] font-medium text-gray-800">{other?.p.name || otherId}</span>
          {dep.type && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{dep.type}</span>
          )}
          {other && other.domain.id !== sel?.domain.id && (
            <Tag className="!text-[9px] !py-0 !px-1" color={domainMaps.colors[other.domain.id] || '#6b7280'}>跨板块</Tag>
          )}
        </div>
        {dep.note && <div className="text-[11px] text-gray-400 mt-0.5">{dep.note}</div>}
      </div>
    )
  }

  return (
    <div className="flex h-full bg-[#f6f7f9]">
      {/* ===== 左：流程树 ===== */}
      <aside className="w-72 border-r border-gray-200 bg-white flex flex-col flex-shrink-0">
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <ApartmentOutlined />
              </span>
              <span className="font-semibold text-[14px] text-gray-800">业务流程目录</span>
            </div>
            <span className="text-[10px] text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
              {visibleCount === totalProcesses ? `${totalProcesses} 个流程` : `${visibleCount} / ${totalProcesses} 个流程`}
            </span>
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索流程"
            allowClear
            prefix={<SearchOutlined className="text-gray-400" />}
            size="small"
          />
          {/* 宿主引擎分布条 */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
              <span>宿主引擎分布</span>
              <span>{linkedCount} 个已关联系统</span>
            </div>
            <div className="h-2 w-full rounded-full overflow-hidden flex bg-gray-100">
              {hostMaps.hosts.map((h) => (
                <div
                  key={h.id}
                  title={`${h.name} ${hostCounts[h.id] || 0}`}
                  style={{ width: `${totalProcesses ? ((hostCounts[h.id] || 0) / totalProcesses) * 100 : 0}%`, backgroundColor: h.color }}
                />
              ))}
              {hostCounts.unknown > 0 && (
                <div title={`待标注 ${hostCounts.unknown}`} style={{ width: `${totalProcesses ? (hostCounts.unknown / totalProcesses) * 100 : 0}%`, backgroundColor: '#d1d5db' }} />
              )}
            </div>
          </div>
          {/* 引擎筛选 chips */}
          <div className="mt-2 flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setHostFilter('all')}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${hostFilter === 'all' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
            >
              全部<span className="ml-1 opacity-70">{hostCounts.all}</span>
            </button>
            {hostMaps.hosts.map((h) => (
              <button
                key={h.id}
                onClick={() => setHostFilter(hostFilter === h.id ? 'all' : h.id)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${hostFilter === h.id ? 'border-transparent text-white' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                style={hostFilter === h.id ? { backgroundColor: h.color } : undefined}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ backgroundColor: hostFilter === h.id ? '#fff' : h.color }} />
                {h.name}
                <span className={`ml-1 ${hostFilter === h.id ? 'opacity-70' : 'text-gray-400'}`}>{hostCounts[h.id] || 0}</span>
              </button>
            ))}
            {hostCounts.unknown > 0 && (
              <button
                onClick={() => setHostFilter(hostFilter === 'unknown' ? 'all' : 'unknown')}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${hostFilter === 'unknown' ? 'bg-gray-400 text-white border-gray-400' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
              >
                待标注<span className="ml-1 opacity-70">{hostCounts.unknown}</span>
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <Tree
            blockNode
            treeData={treeData}
            selectedKeys={selectedId ? [selectedId] : []}
            onSelect={(keys) => setSelectedId(keys.length ? String(keys[0]) : null)}
            expandedKeys={expandedKeys}
            onExpand={setExpandedKeys}
            defaultExpandAll
            className="bg-transparent [&_.ant-tree-node-content-wrapper]:!min-h-0 [&_.ant-tree-node-content-wrapper]:!py-0.5"
          />
        </div>
      </aside>

      {/* ===== 中：依赖图 ===== */}
      <div className="flex-1 relative min-w-0">
        <ProcessGraph
          catalog={catalog}
          selectedId={selectedId}
          onSelect={setSelectedId}
          showAll={showAll}
          onToggleAll={() => setShowAll((v) => !v)}
          hostFilter={hostFilter}
          hostLabels={hostMaps.labels}
          hostColors={hostMaps.colors}
          domainColors={domainMaps.colors}
        />
      </div>

      {/* ===== 右：详情 ===== */}
      <aside className="w-96 border-l border-gray-200 bg-white flex flex-col flex-shrink-0 overflow-y-auto">
        {sel ? (
          <div className="p-5">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-3">
              <span style={{ color: selColor }}>{sel.domain.name}</span>
              <span>›</span>
              <span className="text-gray-500">{sel.group.name}</span>
            </div>
            <Title level={4} className="!mb-0.5 !text-[17px]">{sel.p.name}</Title>
            {sel.p.nameEn && <div className="text-[11px] text-gray-400 mb-2">{sel.p.nameEn} · {sel.p.id}</div>}
            <div className="text-[12px] text-gray-600 bg-gray-50 rounded-lg p-3 mb-4 leading-relaxed">{sel.p.desc || '暂无说明'}</div>

            {/* 关联系统 */}
            <div className="mb-4">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-2">
                <LinkOutlined /> 关联系统
                <span className="text-[10px] bg-gray-100 rounded-full px-1.5">{sel.p.systems?.length || 0}</span>
              </div>
              {sel.p.systems?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {sel.p.systems.map((sid) => {
                    const node = nodeMap.get(sid)
                    return (
                      <Tooltip key={sid} title={node?.description || sid}>
                        <a
                          href={`/topology?node=${sid}`}
                          className="text-[11px] px-2 py-1 rounded-md border transition-all hover:border-blue-300 hover:text-blue-600 flex items-center gap-1"
                          style={{ borderColor: '#e5e7eb', color: '#374151' }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          {node?.name || sid}
                        </a>
                      </Tooltip>
                    )
                  })}
                </div>
              ) : (
                <div className="text-[11px] text-gray-300">未关联系统</div>
              )}
            </div>

            {/* 关联业务流 */}
            {sel.p.flows?.length ? (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-2">
                  <ApartmentOutlined /> 关联业务流
                  <span className="text-[10px] bg-gray-100 rounded-full px-1.5">{sel.p.flows.length}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sel.p.flows.map((fid) => {
                    const flow = flowById.get(fid)
                    return (
                      <a
                        key={fid}
                        href={`/processes?tab=flows&flow=${fid}`}
                        className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-600 transition-all hover:border-blue-300 hover:text-blue-600 flex items-center gap-1"
                      >
                        <ApartmentOutlined className="!text-[10px] text-purple-500" />
                        {flow?.name || fid}
                      </a>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {/* 下游 / 上游 */}
            <div className="mb-2">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-2">
                <ArrowDownOutlined className="!text-[10px] text-green-500" /> 下游 · 它触发/影响
                <span className="text-[10px] bg-gray-100 rounded-full px-1.5">{outDeps.length}</span>
              </div>
              {outDeps.length ? <div className="space-y-1.5">{outDeps.map((d) => depItem(d, 'out'))}</div> : <div className="text-[11px] text-gray-300">无</div>}
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-2">
                <ArrowUpOutlined className="!text-[10px] text-orange-500" /> 上游 · 谁触发/影响它
                <span className="text-[10px] bg-gray-100 rounded-full px-1.5">{inDeps.length}</span>
              </div>
              {inDeps.length ? <div className="space-y-1.5">{inDeps.map((d) => depItem(d, 'in'))}</div> : <div className="text-[11px] text-gray-300">无</div>}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="点击左侧树或图中流程查看详情" />
          </div>
        )}
      </aside>
    </div>
  )
}

function ProcessesPageInner() {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<'catalog' | 'flows'>(searchParams.get('tab') === 'flows' ? 'flows' : 'catalog')

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 订阅外部导航状态是必要同步 setState
    if (searchParams.get('tab') === 'flows') setTab('flows')
  }, [searchParams])

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-200 px-5 pt-2 flex-shrink-0">
        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as 'catalog' | 'flows')}
          items={[
            { key: 'catalog', label: '流程目录', children: null },
            { key: 'flows', label: '跨系统业务流', children: null },
          ]}
          className="[&_.ant-tabs-nav]:!mb-0"
        />
      </div>
      <div className="flex-1 min-h-0">{tab === 'catalog' ? <CatalogView /> : <BusinessFlowsView />}</div>
    </div>
  )
}

export default function ProcessesPage() {
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center"><Spin size="large" /></div>}>
      <ProcessesPageInner />
    </Suspense>
  )
}
