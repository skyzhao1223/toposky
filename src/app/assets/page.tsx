'use client'

import { useState, useMemo } from 'react'
import { Table, Input, Select, Tag, Drawer, Descriptions, Space, Typography, Spin, Button, Switch } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { SystemRelation, SystemNode, SystemLayer, AppType, LAYER_LABELS, LAYER_COLORS, nodeLayer, deriveScope, SCOPE_LABELS, SCOPE_COLORS, NodeScope, APP_TYPE_LABELS, ENV_LABELS, buildBusinessLineMaps, buildDomainMaps, STATUS_LABELS, STATUS_COLORS, EnvStatus, CONFIDENCE_COLORS, CONFIDENCE_LABELS, PENDING_DATA_LABELS } from '@/types'
import { describeEvidence } from '@/lib/evidence'
import { useTopology } from '@/hooks/useTopology'

const { Title, Paragraph } = Typography

export default function AssetsPage() {
  const { data, loading } = useTopology()
  const domainMaps = useMemo(() => buildDomainMaps(data), [data])
  const [search, setSearch] = useState('')
  const [selectedLayer, setSelectedLayer] = useState<string | undefined>()
  const [selectedBl, setSelectedBl] = useState<string | undefined>()
  const [selectedScope, setSelectedScope] = useState<NodeScope | undefined>()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // 只看「有核实结论」的关系：变更决策场景用（口径见 AGENTS.md 第四节）
  const [onlyVerified, setOnlyVerified] = useState(false)

  const blMaps = useMemo(() => buildBusinessLineMaps(data), [data])
  const nodeMap = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes])

  const filtered = useMemo(() => {
    let nodes = data.nodes
    if (search) {
      const kw = search.toLowerCase()
      nodes = nodes.filter((n) =>
        n.name.toLowerCase().includes(kw) ||
        n.description.toLowerCase().includes(kw) ||
        n.id.toLowerCase().includes(kw) ||
        (n.owner && n.owner.toLowerCase().includes(kw)),
      )
    }
    if (selectedLayer) nodes = nodes.filter((n) => n.layer === selectedLayer)
    if (selectedBl) nodes = nodes.filter((n) => n.businessLine === selectedBl)
    if (selectedScope) nodes = nodes.filter((n) => deriveScope(nodeLayer(n), n.appType) === selectedScope)
    return nodes
  }, [data.nodes, search, selectedLayer, selectedBl, selectedScope])

  const selectedDetail = useMemo(() => {
    if (!selectedId) return null
    const node = nodeMap.get(selectedId)
    if (!node) return null
    // 每条关系带上证据口径（统一来自 src/lib/evidence.ts，界面不另写一套说法）
    const relRow = (r: SystemRelation, other: string) => ({
      id: other,
      relId: r.id,
      label: r.label || r.relationType,
      desc: r.description,
      envs: r.environments,
      ev: describeEvidence(r),
    })
    let ups = data.relations.filter((r) => r.target === selectedId).map((r) => relRow(r, r.source))
    let downs = data.relations.filter((r) => r.source === selectedId).map((r) => relRow(r, r.target))
    const total = { ups: ups.length, downs: downs.length }
    if (onlyVerified) {
      ups = ups.filter((x) => x.ev.verified)
      downs = downs.filter((x) => x.ev.verified)
    }
    const flows = (data.businessFlows || []).filter((f) => f.steps.some((s) => s.nodeId === selectedId))
    // 入口层：这个系统从哪些域名/路径进来（来自网关转发规则）
    const entries = (data.entryRoutes || []).filter((r) => r.nodeId === selectedId)
    return { node, ups, downs, flows, entries, total }
  }, [selectedId, data, nodeMap, onlyVerified])

  const columns: ColumnsType<SystemNode> = [
    {
      title: '系统', dataIndex: 'name', key: 'name', width: 180,
      render: (_, n) => (
        <div>
          <div className="font-medium text-gray-800">{n.name}</div>
          <div className="text-[10px] text-gray-400">{n.id}</div>
        </div>
      ),
    },
    {
      title: '业务线', dataIndex: 'businessLine', key: 'businessLine', width: 120,
      render: (bl) =>
        bl ? (
          <Tag style={{ color: blMaps.colors[bl], borderColor: `${blMaps.colors[bl]}55`, backgroundColor: `${blMaps.colors[bl]}0D` }}>
            {blMaps.labels[bl]}
          </Tag>
        ) : '-',
    },
    {
      title: '层级', dataIndex: 'layer', key: 'layer', width: 110,
      render: (l: SystemLayer) =>
        l ? <span style={{ color: LAYER_COLORS[l] }}>{LAYER_LABELS[l]}</span> : '-',
    },
    {
      title: '粒度', key: 'scope', width: 90,
      render: (_: unknown, n: SystemNode) => {
        const s = deriveScope(nodeLayer(n), n.appType)
        return <span style={{ color: SCOPE_COLORS[s] }}>{SCOPE_LABELS[s]}</span>
      },
    },
    {
      title: '类型', dataIndex: 'appType', key: 'appType', width: 90,
      render: (t?: AppType) => t ? <Tag color="geekblue">{APP_TYPE_LABELS[t]}</Tag> : '-',
    },
    { title: '负责人', dataIndex: 'owner', key: 'owner', width: 110, render: (o) => o || '-' },
    {
      title: '仓库', key: 'repo', width: 130,
      render: (_, n) => {
        const repo = n.links?.repo
        if (!repo) return '-'
        const short = repo.replace(/\/$/, '').split('/').pop()
        return (
          <a href={repo} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline" onClick={(e) => e.stopPropagation()}>
            {short}
          </a>
        )
      },
    },
    {
      title: '生产环境', dataIndex: ['environments', 'production'], key: 'prod', width: 130,
      render: (prod) =>
        prod ? (
          <Space size={4}>
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: STATUS_COLORS[prod.status as EnvStatus] }} />
            <span style={{ color: STATUS_COLORS[prod.status as EnvStatus] }}>{STATUS_LABELS[prod.status as EnvStatus]}</span>
            {prod.version && <span className="text-[10px] text-gray-300">v{prod.version}</span>}
          </Space>
        ) : '-',
    },
    {
      title: '依赖', key: 'deps', width: 90,
      render: (_, n) => {
        const upCount = data.relations.filter((r) => r.target === n.id).length
        const downCount = data.relations.filter((r) => r.source === n.id).length
        return (
          <Space size={6}>
            <span className="text-blue-500">↑{upCount}</span>
            <span className="text-gray-300">/</span>
            <span className="text-green-500">↓{downCount}</span>
          </Space>
        )
      },
    },
  ]

  const openDetail = (id: string) => {
    setSelectedId(id)
    setDrawerOpen(true)
  }

  if (loading) return <div className="h-full flex items-center justify-center"><Spin size="large" description="加载中..." /></div>

  return (
    <div className="h-full flex flex-col bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto w-full flex flex-col h-full">
        <div className="mb-4">
          <Title level={4} className="!mb-1">资产目录</Title>
          <Paragraph type="secondary" className="!mb-0">全部业务系统的资产清单与聚合详情</Paragraph>
        </div>

        <Space className="mb-4 flex-wrap">
          <Input.Search
            placeholder="搜索系统名称 / 描述 / 负责人..."
            allowClear
            prefix={<SearchOutlined />}
            className="!w-72"
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            placeholder="全部层级"
            allowClear
            className="!w-36"
            value={selectedLayer}
            onChange={setSelectedLayer}
            options={(Object.keys(LAYER_LABELS) as SystemLayer[]).map((l) => ({ value: l, label: LAYER_LABELS[l] }))}
          />
          <Select
            placeholder="全部业务线"
            allowClear
            className="!w-40"
            value={selectedBl}
            onChange={setSelectedBl}
            options={Object.entries(blMaps.labels).map(([k, v]) => ({ value: k, label: v }))}
          />
          <Select
            placeholder="全部粒度"
            allowClear
            className="!w-28"
            value={selectedScope}
            onChange={setSelectedScope}
            options={(Object.keys(SCOPE_LABELS) as NodeScope[]).map((s) => ({ value: s, label: SCOPE_LABELS[s] }))}
          />
          <span className="text-xs text-gray-400">{filtered.length} 个系统</span>
        </Space>

        <div className="flex-1 min-h-0 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <Table
            rowKey="id"
            columns={columns}
            dataSource={filtered}
            size="small"
            scroll={{ y: 'calc(100vh - 260px)', x: 1000 }}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            onRow={(record) => ({
              onClick: () => openDetail(record.id),
              style: { cursor: 'pointer' },
            })}
          />
        </div>
      </div>

      <Drawer
        title={selectedDetail?.node.name}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={360}
      >
        {selectedDetail && (
          <div className="space-y-4">
            <Descriptions column={1} size="small" title="基本信息">
              <Descriptions.Item label="描述">{selectedDetail.node.description || '-'}</Descriptions.Item>
              <Descriptions.Item label="业务线">
                {selectedDetail.node.businessLine ? (blMaps.labels[selectedDetail.node.businessLine] || selectedDetail.node.businessLine) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="层级">
                {selectedDetail.node.layer ? LAYER_LABELS[selectedDetail.node.layer as SystemLayer] : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="粒度">{SCOPE_LABELS[deriveScope(nodeLayer(selectedDetail.node), selectedDetail.node.appType)]}</Descriptions.Item>
              <Descriptions.Item label="应用类型">
                {selectedDetail.node.appType ? APP_TYPE_LABELS[selectedDetail.node.appType as AppType] : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="负责人">{selectedDetail.node.owner || '-'}</Descriptions.Item>
              {selectedDetail.node.vendor && (
                <Descriptions.Item label="供应商">{selectedDetail.node.vendor}</Descriptions.Item>
              )}
              <Descriptions.Item label="联系人">
                {selectedDetail.node.contacts && selectedDetail.node.contacts.length > 0 ? (
                  <div className="space-y-1">
                    {selectedDetail.node.contacts.map((c, i) => (
                      <div key={i} className="text-xs">
                        <span className="font-medium text-gray-700">{c.name}</span>
                        {c.role && <span className="text-gray-400"> · {c.role}</span>}
                        <div className="text-[11px] text-gray-500 flex flex-wrap gap-x-2">
                          {c.phone && <a href={`tel:${c.phone}`} className="text-blue-500 hover:underline">{c.phone}</a>}
                          {c.email && <a href={`mailto:${c.email}`} className="text-blue-500 hover:underline">{c.email}</a>}
                          {c.im && <span>{c.im}</span>}
                        </div>
                        {c.note && <div className="text-[10px] text-gray-400">{c.note}</div>}
                      </div>
                    ))}
                  </div>
                ) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="访问地址">
                {selectedDetail.node.url ? (
                  <a href={selectedDetail.node.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all">
                    {selectedDetail.node.url}
                  </a>
                ) : '-'}
              </Descriptions.Item>
            </Descriptions>

            <Descriptions column={1} size="small" title="生产环境">
              {selectedDetail.node.environments?.production ? (
                <>
                  <Descriptions.Item label="状态">
                    <Tag color={STATUS_COLORS[selectedDetail.node.environments.production.status as EnvStatus]}>
                      {STATUS_LABELS[selectedDetail.node.environments.production.status as EnvStatus]}
                    </Tag>
                  </Descriptions.Item>
                  {selectedDetail.node.environments.production.version && (
                    <Descriptions.Item label="版本">{selectedDetail.node.environments.production.version}</Descriptions.Item>
                  )}
                  {selectedDetail.node.environments.production.replicas !== undefined && (
                    <Descriptions.Item label="实例">{selectedDetail.node.environments.production.replicas}</Descriptions.Item>
                  )}
                </>
              ) : (
                <Descriptions.Item label="状态">-</Descriptions.Item>
              )}
            </Descriptions>

            {selectedDetail.entries.length > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">
                  入口路由（{selectedDetail.entries.length}）
                  <span className="text-[10px] text-gray-400 ml-2">来自网关转发规则</span>
                </div>
                <Space orientation="vertical" size={2} className="w-full">
                  {selectedDetail.entries.map((e, i) => (
                    <div key={e.env + e.domain + e.path + i} className="text-[11px] flex items-center gap-1.5 flex-wrap">
                      <Tag className="!text-[10px] !px-1 !py-0 !mr-0">{e.env}</Tag>
                      <span className="text-gray-700">{e.domain}</span>
                      <code className="text-gray-500">{e.path}</code>
                      {e.https === false && (
                        <Tag color="orange" className="!text-[10px] !px-1 !py-0 !mr-0">未强制 HTTPS</Tag>
                      )}
                    </div>
                  ))}
                </Space>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <Switch size="small" checked={onlyVerified} onChange={setOnlyVerified} />
              <span className="text-xs text-gray-500">只看已核实（有核实结论的关系）</span>
              {onlyVerified && (
                <span className="text-[10px] text-gray-400">
                  上游 {selectedDetail.ups.length}/{selectedDetail.total.ups} · 下游 {selectedDetail.downs.length}/{selectedDetail.total.downs}
                </span>
              )}
            </div>

            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">上游依赖（{selectedDetail.ups.length}）</div>
              <Space orientation="vertical" size={4} className="w-full">
                {selectedDetail.ups.map((u) => (
                  <div key={u.id}>
                    <Button type="link" size="small" className="!p-0 !h-auto !text-left" onClick={() => openDetail(u.id)}>
                      <span className="text-blue-400">↑ </span>{nodeMap.get(u.id)?.name || u.id}
                      <span className="text-[10px] text-gray-300 ml-1">{u.label}</span>
                    </Button>
                    {u.envs && u.envs.length > 0 && (
                      <span className="ml-2">
                        {u.envs.map((e) => <Tag key={e} className="!text-[10px] !px-1 !py-0 !mr-1">{ENV_LABELS[e]}</Tag>)}
                      </span>
                    )}
                    {u.desc && <div className="text-[10px] text-gray-400 ml-4">${u.desc}</div>}
                    <div className="text-[10px] ml-4 flex items-center gap-1" title={u.ev.headline}>
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: CONFIDENCE_COLORS[u.ev.confidence] }} />
                      <span className="text-gray-400">
                        {CONFIDENCE_LABELS[u.ev.confidence]} · {u.ev.kindLabel || '无来源'} · {u.ev.verdictLabel || '未核实'}
                        {u.ev.pendingData && (
                          <span className="text-orange-400">（{PENDING_DATA_LABELS[u.ev.pendingData]}）</span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
                {selectedDetail.ups.length === 0 && <span className="text-xs text-gray-300">无</span>}
              </Space>
            </div>

            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">下游依赖（{selectedDetail.downs.length}）</div>
              <Space orientation="vertical" size={4} className="w-full">
                {selectedDetail.downs.map((d) => (
                  <div key={d.id}>
                    <Button type="link" size="small" className="!p-0 !h-auto !text-left" onClick={() => openDetail(d.id)}>
                      <span className="text-green-500">↓ </span>{nodeMap.get(d.id)?.name || d.id}
                      <span className="text-[10px] text-gray-300 ml-1">{d.label}</span>
                    </Button>
                    {d.envs && d.envs.length > 0 && (
                      <span className="ml-2">
                        {d.envs.map((e) => <Tag key={e} className="!text-[10px] !px-1 !py-0 !mr-1">{ENV_LABELS[e]}</Tag>)}
                      </span>
                    )}
                    {d.desc && <div className="text-[10px] text-gray-400 ml-4">${d.desc}</div>}
                    <div className="text-[10px] ml-4 flex items-center gap-1" title={d.ev.headline}>
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: CONFIDENCE_COLORS[d.ev.confidence] }} />
                      <span className="text-gray-400">
                        {CONFIDENCE_LABELS[d.ev.confidence]} · {d.ev.kindLabel || '无来源'} · {d.ev.verdictLabel || '未核实'}
                        {d.ev.pendingData && (
                          <span className="text-orange-400">（{PENDING_DATA_LABELS[d.ev.pendingData]}）</span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
                {selectedDetail.downs.length === 0 && <span className="text-xs text-gray-300">无</span>}
              </Space>
            </div>

            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">参与的业务流（{selectedDetail.flows.length}）</div>
              <Space orientation="vertical" size={4} className="w-full">
                {selectedDetail.flows.map((f) => (
                  <Tag key={f.id} color={f.domain ? domainMaps.colors[f.domain] : 'blue'}>
                    ◈ {f.name}
                    {f.domain && <span className="ml-1 opacity-70">{domainMaps.labels[f.domain]}</span>}
                  </Tag>
                ))}
                {selectedDetail.flows.length === 0 && <span className="text-xs text-gray-300">未参与业务流</span>}
              </Space>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
