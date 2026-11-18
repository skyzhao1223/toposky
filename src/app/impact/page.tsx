'use client'

import { useState, useMemo } from 'react'
import { Select, Card, Table, Typography, Spin, Space, Empty, InputNumber, Button } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { AlertOutlined, ScheduleOutlined, DownloadOutlined } from '@ant-design/icons'
import { buildBusinessLineMaps, buildDomainMaps, buildProcessHostMaps, LAYER_LABELS, LAYER_COLORS, nodeLayer, CRITICALITY_COLORS, processDomainColor, RELATION_LABELS, CONTRACT_KIND_LABELS, CONFIDENCE_LABELS, CONFIDENCE_COLORS } from '@/types'
import { validateTopology } from '@/lib/validateTopology'
import { computeImpact } from '@/lib/impact'
import { describeEvidence } from '@/lib/evidence'
import { useTopology } from '@/hooks/useTopology'
import { APP_NAME } from '@/lib/branding'

const { Title, Paragraph } = Typography

function ButtonLink({ id, onClick, label }: { id: string; onClick: (id: string) => void; label: string }) {
  return (
    <button className="text-sm text-gray-700 hover:text-blue-600 transition-colors" onClick={() => onClick(id)}>
      {label}
    </button>
  )
}

export default function ImpactPage() {
  const { data, loading } = useTopology()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [depth, setDepth] = useState(2)

  const nodeMap = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes])
  const relMap = useMemo(() => new Map(data.relations.map((r) => [r.id, r])), [data.relations])
  /** 该受影响节点的「路径最弱一环」是谁、凭什么（见 src/lib/evidence.ts） */
  const evidenceOf = (relId?: string) => {
    const rel = relId ? relMap.get(relId) : undefined
    return rel ? describeEvidence(rel) : undefined
  }
  const blMaps = useMemo(() => buildBusinessLineMaps(data), [data])
  const hostMaps = useMemo(() => buildProcessHostMaps(data), [data])
  const domainMaps = useMemo(() => buildDomainMaps(data), [data])

  const withRelations = useMemo(() => {
    const s = new Set<string>()
    data.relations.forEach((r) => { s.add(r.source); s.add(r.target) })
    return Array.from(s)
  }, [data.relations])

  // 影响面计算统一走 src/lib/impact.ts（与 /api/impact 同一实现）
  const analysis = useMemo(
    () => (selectedId ? computeImpact(data, selectedId, depth) : null),
    [selectedId, data, depth],
  )

  const catColor = (id: string) => {
    const n = nodeMap.get(id)
    const layer = n ? nodeLayer(n) : undefined
    return (layer && LAYER_COLORS[layer]) || '#999'
  }

  interface ImpactRow { id: string; dir: string; depth: number; key: string }

  const detailColumns: ColumnsType<ImpactRow> = [
    {
      title: '系统', key: 'name', render: (_, { id }) => (
        <ButtonLink id={id} onClick={setSelectedId} label={nodeMap.get(id)?.name || id} />
      ),
    },
    { title: '方向', dataIndex: 'dir', width: 70 },
    { title: '层级距离', dataIndex: 'depth', width: 90, render: (d) => `L${d}` },
    {
      title: '业务线', key: 'bl', width: 110,
      render: (_, { id }) => {
        const n = nodeMap.get(id)
        return n?.businessLine ? (blMaps.labels[n.businessLine] || n.businessLine) : '-'
      },
    },
    {
      title: '层级', key: 'layer', width: 90,
      render: (_, { id }) => {
        const n = nodeMap.get(id)
        const layer = n ? nodeLayer(n) : undefined
        return layer ? LAYER_LABELS[layer] : '-'
      },
    },
  ]

  const detailRows = useMemo(() => {
    if (!analysis) return []
    return [
      ...analysis.up.map((u) => ({ id: u.id, dir: '上游', depth: u.depth, key: `up-${u.id}` })),
      ...analysis.down.map((u) => ({ id: u.id, dir: '下游', depth: u.depth, key: `down-${u.id}` })),
    ]
  }, [analysis])

  const readiness = useMemo(() => {
    if (!analysis) return null
    const ids = Array.from(analysis.impactIds)
    const internal = ids.map((id) => nodeMap.get(id)).filter((x): x is NonNullable<typeof x> => !!x).filter((x) => (x.layer || x.category) !== 'external')
    const withOwner = internal.filter((x) => x.owner).length
    const external = ids.map((id) => nodeMap.get(id)).filter((x): x is NonNullable<typeof x> => !!x).filter((x) => (x.layer || x.category) === 'external')
    const extMissingContacts = external.filter((x) => !x.contacts || x.contacts.length === 0).length
    const val = validateTopology(data)
    return {
      total: ids.length - 1,
      ownerPct: internal.length ? Math.round((withOwner / internal.length) * 100) : 100,
      extMissingContacts,
      flowCount: analysis.affectedFlows.length,
      procCount: analysis.affectedProcesses.length,
      valErrors: val.errors.length,
      valWarnings: val.warnings.length,
    }
  }, [analysis, nodeMap, data])

  const exportImpact = () => {
    if (!analysis || !selectedId) return
    const n = nodeMap.get(selectedId)
    const name = n?.name || selectedId
    const layer = n ? nodeLayer(n) : undefined
    const blLabel = (bl?: string) => (bl ? blMaps.labels[bl] || bl : '-')

    const ownerCount = new Map<string, number>()
    analysis.impactIds.forEach((id) => {
      const o = nodeMap.get(id)?.owner
      if (o) ownerCount.set(o, (ownerCount.get(o) || 0) + 1)
    })

    const L: string[] = []
    L.push(`# 影响面分析 · ${name}`, '')
    L.push(`- 分析对象：${name}（\`${selectedId}\`，${layer ? LAYER_LABELS[layer] : '未分层'}）`)
    L.push(`- 生成时间：${new Date().toLocaleString()}`)
    L.push(`- 传播深度：${depth} 层`)
    L.push(`- 受影响系统：上游 ${analysis.up.length} / 下游 ${analysis.down.length} / 合计 ${analysis.impactIds.size - 1}`)
    L.push(`- 受影响业务流：${analysis.affectedFlows.length} 条；受影响流程：${analysis.affectedProcesses.length} 个`)
    L.push('')
    L.push('## 结论可信度（按传播路径最弱一环）')
    L.push('')
    L.push('| 最弱一环 | 条数 | 含义 |')
    L.push('|---|---|---|')
    L.push(`| high | ${analysis.trust.high} | 路径全程有代码/配置依据，**可直接承诺** |`)
    L.push(`| medium | ${analysis.trust.medium} | 有台账/网关/Nacos 级依据，**可作参考** |`)
    L.push(`| low | ${analysis.trust.low} | 路径含无证据关系，**仅作线索** |`)
    L.push(`| doubtful | ${analysis.trust.doubtful} | 路径含**有反证**的关系，**不可对外承诺** |`)
    L.push('')
    L.push(`> 结论分层：${analysis.trust.high} 条可承诺 / ${analysis.trust.low + analysis.trust.doubtful} 条仅作线索。`)
    L.push(`> 一条链路的可信度取决于它最弱的那条边 —— 只要经过 doubtful，整条结论就不成立。`)
    L.push('')

    L.push('## 需通知负责人')
    if (ownerCount.size) {
      Array.from(ownerCount.entries()).sort((a, b) => b[1] - a[1]).forEach(([o, c]) => L.push(`- ${o}（${c} 个系统）`))
    } else L.push('- （无）')
    L.push('')

    L.push(`## 受影响业务流（${analysis.affectedFlows.length}）`)
    if (analysis.affectedFlows.length) {
      L.push('| 优先级 | 业务流 | 业务域 | 主责业务线 | 负责人 | 命中步骤 |')
      L.push('|---|---|---|---|---|---|')
      analysis.affectedFlows.forEach((f) => {
        const hit = f.steps.filter((s) => analysis.impactIds.has(s.nodeId)).map((s) => nodeMap.get(s.nodeId)?.name || s.nodeId).join('、')
        L.push(`| ${f.criticality || '-'} | ${f.name} | ${f.domain ? domainMaps.labels[f.domain] || f.domain : '-'} | ${f.businessLine ? blMaps.labels[f.businessLine] || f.businessLine : '-'} | ${f.owner || '-'} | ${hit} |`)
      })
    } else L.push('（无）')
    L.push('')

    L.push(`## 受影响业务流程（${analysis.affectedProcesses.length}）`)
    if (analysis.affectedProcesses.length) {
      L.push('| 流程 | 流程组 | 板块 | 宿主 |')
      L.push('|---|---|---|---|')
      analysis.affectedProcesses.forEach((p) =>
        L.push(`| ${p.name} | ${p.groupName} | ${domainMaps.labels[p.domainId] || p.domainId} | ${p.host ? hostMaps.labels[p.host] || p.host : '-'} |`),
      )
    } else L.push('（无）')
    L.push('')

    const repoMap = new Map<string, string[]>()
    analysis.impactIds.forEach((id) => {
      const repo = nodeMap.get(id)?.links?.repo
      if (!repo) return
      if (!repoMap.has(repo)) repoMap.set(repo, [])
      repoMap.get(repo)!.push(id)
    })
    L.push(`## 受影响仓库（${repoMap.size}）`)
    if (repoMap.size) {
      L.push('| 仓库 | 受影响系统 | 系统数 |')
      L.push('|---|---|---|')
      Array.from(repoMap.entries()).sort((a, b) => b[1].length - a[1].length).forEach(([repo, ids]) => {
        const short = repo.replace(/\/$/, '').split('/').pop()
        L.push(`| ${short} | ${ids.map((id) => nodeMap.get(id)?.name || id).join('、')} | ${ids.length} |`)
      })
    } else L.push('（无）')
    L.push('')

    const directEdges = data.relations.filter((r) => r.source === selectedId || r.target === selectedId)
    L.push(`## 直接依赖契约（${directEdges.length}）`)
    if (directEdges.length) {
      L.push('| 方向 | 来源 → 目标 | 关系 | 契约 | 可信度 | 证据 | 备注 |')
      L.push('|---|---|---|---|---|---|---|')
      directEdges.forEach((r) => {
        const dir = r.source === selectedId ? '本系统 → 下游' : '上游 → 本系统'
        const c = r.contract || {}
        const contract = c.kind || c.target
          ? `${c.kind ? CONTRACT_KIND_LABELS[c.kind] || c.kind : ''}${c.kind && c.target ? '：' : ''}${c.target || ''}`
          : '-'
        const ev = describeEvidence(r)
        L.push(`| ${dir} | ${nodeMap.get(r.source)?.name || r.source} → ${nodeMap.get(r.target)?.name || r.target} | ${r.label || RELATION_LABELS[r.relationType]} | ${contract} | ${CONFIDENCE_LABELS[ev.confidence]}${ev.verified ? '' : '（未核实）'} | ${ev.kindLabel || '无来源'}·${ev.verdictLabel || '未核实'} | ${c.note || '-'} |`)
      })
    } else L.push('（无）')
    L.push('')

    const sysTable = (title: string, rows: typeof analysis.up) => {
      L.push(`## ${title}（${rows.length}）`)
      if (rows.length) {
        L.push('| 系统 | 层级 | 业务线 | 距离 | 可信度 | 依据（最弱一环） | 负责人 |')
        L.push('|---|---|---|---|---|---|---|')
        rows.forEach((r) => {
          const x = nodeMap.get(r.id)
          const l = x ? nodeLayer(x) : undefined
          const rel = r.weakestRelationId ? relMap.get(r.weakestRelationId) : undefined
          const ev = rel ? describeEvidence(rel) : undefined
          L.push(`| ${x?.name || r.id} | ${l ? LAYER_LABELS[l] : '-'} | ${blLabel(x?.businessLine)} | L${r.depth} | ${CONFIDENCE_LABELS[r.confidence]} | ${ev ? `${ev.kindLabel || '无来源'}·${ev.verdictLabel || '未核实'}` : '-'} | ${x?.owner || '-'} |`)
        })
      } else L.push('（无）')
      L.push('')
    }
    sysTable('上游依赖', analysis.up)
    sysTable('下游影响', analysis.down)

    L.push('## 口径与局限', '')
    L.push('- 本分析为**元数据图谱级**影响：受影响 = 业务流程路径**触及**了受影响系统，不等于该变更必然导致其故障。')
    L.push('- 节点粒度为「系统 / 服务」，边为调用 / 依赖 / 消息等粗粒度关系，**不含接口、字段、条件分支**等代码级信息。')
    L.push('- 一个节点可能对应整个平台或一个仓库中的多个服务；同名系统不等于同一段代码。')
    L.push('- 结论用于**圈定范围、通知团队、初筛回归**；精确定位请结合变更 diff、接口契约与测试用例。')
    L.push('- **可信度口径**：每条边带置信度与核实结论（verdict）；**「有来源标注」≠「已核实」**，未核实的边在表中标「未核实」。变更决策与对外承诺只看「高」。')
    L.push('')

    L.push('---', `> 由「${APP_NAME} · 影响分析」生成`)

    const blob = new Blob([L.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // 文件名用本机日期：toISOString() 是 UTC，凌晨 0–8 点会写成「前一天」
    const dlNow = new Date()
    const pad2 = (n: number) => String(n).padStart(2, '0')
    a.download = `impact-${selectedId}-${dlNow.getFullYear()}-${pad2(dlNow.getMonth() + 1)}-${pad2(dlNow.getDate())}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="h-full flex items-center justify-center"><Spin size="large" description="加载中..." /></div>

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-4">
          <Title level={4} className="!mb-1">影响分析</Title>
          <Paragraph type="secondary" className="!mb-0">选择系统，分析其依赖上下游与受影响的业务流<span className="text-[11px] text-gray-400">（元数据图谱级：圈定范围/通知团队，非代码级精确定位）</span></Paragraph>
        </div>

        <Card className="!mb-4">
          <Space>
            <Select
              placeholder="选择要分析的系统..."
              className="!w-80"
              showSearch
              optionFilterProp="label"
              value={selectedId || undefined}
              onChange={(v) => setSelectedId(v || null)}
              options={withRelations.map((id) => ({ value: id, label: nodeMap.get(id)?.name || id }))}
            />
            <Space size={6}>
              <span className="text-sm text-gray-500">深度</span>
              <InputNumber min={1} max={3} value={depth} onChange={(v) => setDepth(v || 1)} />
            </Space>
            <Button icon={<DownloadOutlined />} onClick={exportImpact} disabled={!analysis} size="small">
              导出影响面
            </Button>
          </Space>
        </Card>

        {readiness && (
          <Card size="small" className="!mb-4" title={<span className="text-[13px]">演示预检 · 数据就绪度</span>}>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[12px]">
              {[
                { ok: readiness.flowCount > 0, text: `受影响业务流 ${readiness.flowCount}`, bad: '未命中业务流，结果会偏空' },
                { ok: readiness.procCount > 0, text: `受影响流程 ${readiness.procCount}`, bad: '未命中流程目录' },
                { ok: readiness.ownerPct >= 80, text: `负责人覆盖 ${readiness.ownerPct}%`, bad: '通知名单可能不全' },
                { ok: readiness.extMissingContacts === 0, text: `外部联系人缺失 ${readiness.extMissingContacts}`, bad: '外部方无对接人' },
                { ok: readiness.valErrors === 0, text: `全局校验错误 ${readiness.valErrors}`, bad: '存在致命错误，先修复' },
              ].map((it) => (
                <span key={it.text} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: it.ok ? '#52c41a' : '#faad14' }} />
                  <span className={it.ok ? 'text-gray-700' : 'text-orange-600'}>{it.text}</span>
                  {!it.ok && <span className="text-[10px] text-gray-400">（{it.bad}）</span>}
                </span>
              ))}
              <span className="text-[10px] text-gray-300 ml-auto">全局校验提醒 {readiness.valWarnings} 条</span>
            </div>
          </Card>
        )}

        {analysis && (
          <Card
            size="small"
            className="!mb-4"
            title={<span className="text-[13px]">结论可信度（按传播路径最弱一环）</span>}
          >
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[12px]">
              {(['high', 'medium', 'low', 'doubtful'] as const).map((k) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: CONFIDENCE_COLORS[k] }} />
                  <span style={{ color: CONFIDENCE_COLORS[k] }}>
                    {CONFIDENCE_LABELS[k]} {analysis.trust[k]}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {k === 'high' ? '可直接承诺' : k === 'medium' ? '可作参考' : k === 'low' ? '仅作线索' : '不可对外承诺'}
                  </span>
                </span>
              ))}
              <span className="text-[10px] text-gray-400 ml-auto">
                一条链路的可信度 = 它最弱的那条边
              </span>
            </div>
          </Card>
        )}

        {analysis ? (
          <div className="space-y-4">
            <Card
              size="small"
              title={
                <span className="flex items-center gap-2">
                  <AlertOutlined style={{ color: '#faad14' }} />
                  受影响业务流
                  <span className="text-xs text-gray-300 font-normal">({analysis.affectedFlows.length})</span>
                </span>
              }
            >
              {analysis.affectedFlows.length > 0 ? (
                <div className="space-y-3">
                  {domainMaps.order.map((dom) => {
                    const items = analysis.affectedFlows.filter((f) => f.domain === dom)
                    if (items.length === 0) return null
                    return (
                      <div key={dom}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: domainMaps.colors[dom] }} />
                          <span className="text-[12px] font-medium" style={{ color: domainMaps.colors[dom] }}>
                            {domainMaps.labels[dom]}
                          </span>
                          <span className="text-[10px] text-gray-400">{items.length} 条</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {items.map((f) => (
                            <Card key={f.id} size="small" className="!border-orange-200 !bg-orange-50/40">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium text-orange-700">◈ {f.name}</span>
                                {f.criticality && (
                                  <span
                                    className="text-[9px] px-1 rounded"
                                    style={{ color: '#fff', backgroundColor: CRITICALITY_COLORS[f.criticality as keyof typeof CRITICALITY_COLORS] }}
                                  >
                                    {f.criticality}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-gray-500 mt-1 line-clamp-2">{f.description}</div>
                                <div className="text-[10px] text-gray-400 mt-1.5">
                                  经过 {f.steps.filter((s) => analysis.impactIds.has(s.nodeId)).length} 个受影响步骤
                                </div>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <Empty description="该系统未关联到已维护的业务流" />
              )}
            </Card>

            <Card
              size="small"
              title={
                <span className="flex items-center gap-2">
                  <ScheduleOutlined style={{ color: '#2563eb' }} />
                  受影响业务流程
                  <span className="text-xs text-gray-300 font-normal">({analysis.affectedProcesses.length})</span>
                </span>
              }
            >
              {analysis.affectedProcesses.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {analysis.affectedProcesses.map((p) => (
                    <a
                      key={p.id}
                      href={`/processes?process=${p.id}`}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] transition-all hover:shadow-sm"
                      style={{
                        borderColor: `${processDomainColor(p.domainId, domainMaps.colors)}55`,
                        backgroundColor: `${processDomainColor(p.domainId, domainMaps.colors)}0D`,
                        color: processDomainColor(p.domainId, domainMaps.colors),
                      }}
                    >
                      <span className="w-1.5 h-3.5 rounded-full" style={{ backgroundColor: processDomainColor(p.domainId, domainMaps.colors) }} />
                      {p.name}
                      <span className="text-[10px] text-gray-400">({p.groupName})</span>
                      {p.host && (
                        <span
                          className="text-[9px] px-1 py-px rounded text-white"
                          style={{ backgroundColor: hostMaps.colors[p.host] || '#8c8c8c' }}
                        >
                          {hostMaps.labels[p.host] || p.host}
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              ) : (
                <Empty description="该系统未关联到已维护的业务流程" />
              )}
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Card size="small" title={`上游依赖（${analysis.up.length}）`}>
                <Space orientation="vertical" size={4} className="w-full">
                  {analysis.up.map((u) => (
                    <div key={u.id} className="flex items-center gap-2 text-sm">
                      <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: catColor(u.id) }} />
                      <ButtonLink id={u.id} onClick={setSelectedId} label={nodeMap.get(u.id)?.name || u.id} />
                      <span className="text-[10px] ml-auto flex-shrink-0 flex items-center gap-1">
                        <span
                          className="w-1.5 h-1.5 rounded-full inline-block"
                          style={{ backgroundColor: CONFIDENCE_COLORS[u.confidence] }}
                          title={`路径最弱一环 ${CONFIDENCE_LABELS[u.confidence]}：${evidenceOf(u.weakestRelationId)?.headline || "（该边无证据标注）"}`}
                        />
                        {evidenceOf(u.weakestRelationId)?.verified === false && (
                          <span className="text-orange-500" title="该链路最弱一环只有来源标注、未做代码核实">
                            未核实
                          </span>
                        )}
                        <span className="text-gray-300">L{u.depth}</span>
                      </span>
                    </div>
                  ))}
                  {analysis.up.length === 0 && <span className="text-sm text-gray-300">无上游依赖</span>}
                </Space>
              </Card>

              <Card size="small" title={`下游影响（${analysis.down.length}）`}>
                <Space orientation="vertical" size={4} className="w-full">
                  {analysis.down.map((u) => (
                    <div key={u.id} className="flex items-center gap-2 text-sm">
                      <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: catColor(u.id) }} />
                      <ButtonLink id={u.id} onClick={setSelectedId} label={nodeMap.get(u.id)?.name || u.id} />
                      <span className="text-[10px] ml-auto flex-shrink-0 flex items-center gap-1">
                        <span
                          className="w-1.5 h-1.5 rounded-full inline-block"
                          style={{ backgroundColor: CONFIDENCE_COLORS[u.confidence] }}
                          title={`路径最弱一环 ${CONFIDENCE_LABELS[u.confidence]}：${evidenceOf(u.weakestRelationId)?.headline || "（该边无证据标注）"}`}
                        />
                        {evidenceOf(u.weakestRelationId)?.verified === false && (
                          <span className="text-orange-500" title="该链路最弱一环只有来源标注、未做代码核实">
                            未核实
                          </span>
                        )}
                        <span className="text-gray-300">L{u.depth}</span>
                      </span>
                    </div>
                  ))}
                  {analysis.down.length === 0 && <span className="text-sm text-gray-300">无下游影响</span>}
                </Space>
              </Card>
            </div>

            <Card size="small" title="受影响系统明细">
              <Table rowKey="key" columns={detailColumns} dataSource={detailRows} size="small" pagination={false} />
            </Card>
          </div>
        ) : (
          <Card>
            <Empty description="选择系统后，这里将展示其依赖上下游与受影响的业务流" />
          </Card>
        )}
      </div>
    </div>
  )
}
