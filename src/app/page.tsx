'use client'

import { useMemo } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Card, Col, Row, Progress, Tag, Typography, Spin, Tooltip } from 'antd'
import {
  DatabaseOutlined,
  LinkOutlined,
  SwapOutlined,
  HeartOutlined,
  ApartmentOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons'
import { LAYER_LABELS, LAYER_COLORS, LAYER_ORDER, buildBusinessLineMaps, buildDomainMaps, STATUS_LABELS, STATUS_COLORS, EnvStatus, BusinessFlowDomain, CRITICALITY_COLORS } from '@/types'
import { useTopology } from '@/hooks/useTopology'
import { APP_TAGLINE } from '@/lib/branding'
const { Title, Paragraph } = Typography

// 紧凑指标卡：左侧色条 + 图标 + 数值 + 副标题
function MetricCard({ label, value, color, icon, sub, href }: { label: string; value: number | string; color: string; icon: ReactNode; sub?: string; href?: string }) {
  const inner = (
    <div className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 px-4 py-3 hover:border-blue-300 hover:shadow-sm transition-all h-full">
      <div className="w-1 self-stretch rounded-full" style={{ backgroundColor: color }} />
      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base" style={{ backgroundColor: `${color}12`, color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-gray-400">{label}</div>
        <div className="text-xl font-semibold text-gray-800 leading-tight">{value}</div>
        {sub && <div className="text-[10px] text-gray-300">{sub}</div>}
      </div>
    </div>
  )
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner
}

export default function Dashboard() {
  const { data, loading } = useTopology()

  const blMaps = useMemo(() => buildBusinessLineMaps(data), [data])
  const domainMaps = useMemo(() => buildDomainMaps(data), [data])

  const stats = useMemo(() => {
    const nodes = data.nodes
    const relations = data.relations
    const flows = data.businessFlows || []

    const layerCounts = LAYER_ORDER.map((l) => ({
      layer: l,
      count: nodes.filter((n) => n.layer === l).length,
    }))

    const blCounts = Object.keys(blMaps.labels).map((bl) => ({
      bl,
      label: blMaps.labels[bl],
      color: blMaps.colors[bl],
      count: nodes.filter((n) => n.businessLine === bl).length,
    })).filter((x) => x.count > 0).sort((a, b) => b.count - a.count)

    const prodStatus: Record<EnvStatus, number> = { running: 0, stopped: 0, degraded: 0, unknown: 0 }
    nodes.forEach((n) => {
      const st = n.environments?.production?.status
      if (st) prodStatus[st]++
    })

    const relTypes: Record<string, number> = {}
    relations.forEach((r) => { relTypes[r.relationType] = (relTypes[r.relationType] || 0) + 1 })

    const domainCounts = (Object.keys(domainMaps.labels) as BusinessFlowDomain[]).map((dom) => ({
      dom,
      count: flows.filter((f) => f.domain === dom).length,
    })).filter((x) => x.count > 0)

    const processCount = data.processCatalog
      ? data.processCatalog.domains.reduce((s, d) => s + d.groups.reduce((s2, g) => s2 + g.processes.length, 0), 0)
      : 0

    return { layerCounts, blCounts, prodStatus, relTypes, totalFlows: flows.length, domainCounts, processCount }
  }, [data, blMaps, domainMaps])

  if (loading) {
    return <div className="h-full flex items-center justify-center"><Spin size="large" description="加载中..." /></div>
  }

  const prodTotal = Object.values(stats.prodStatus).reduce((s, n) => s + n, 0)
  const total = Math.max(data.nodes.length, 1)
  const unhealthy = stats.prodStatus.stopped + stats.prodStatus.degraded

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto" style={{ maxWidth: 1440 }}>
        <div className="flex items-end justify-between mb-5">
          <div>
            <Title level={4} className="!mb-0.5">总览</Title>
            <Paragraph type="secondary" className="!mb-0 text-[13px]">{APP_TAGLINE}</Paragraph>
          </div>
          <div className="flex items-center gap-2">
            <Tag color={unhealthy > 0 ? 'orange' : 'green'} className="!mr-0">
              {unhealthy > 0 ? `${unhealthy} 个系统异常` : '全部系统健康'}
            </Tag>
          </div>
        </div>

        {/* 指标卡（紧凑） */}
        <Row gutter={12} className="mb-4">
          <Col span={6}>
            <MetricCard label="系统总数" value={data.nodes.length} color="#2563eb" icon={<DatabaseOutlined />} sub={`${data.businessFlows?.length || 0} 条业务流`} href="/assets" />
          </Col>
          <Col span={6}>
            <MetricCard label="调用关系" value={data.relations.length} color="#0891b2" icon={<LinkOutlined />} sub={`${Object.keys(stats.relTypes).length} 种关系类型`} href="/topology" />
          </Col>
          <Col span={6}>
            <MetricCard label="业务流 / 流程" value={stats.totalFlows} color="#7c3aed" icon={<SwapOutlined />} sub={`${stats.processCount} 个流程 · ${stats.domainCounts.length} 个业务域`} href="/processes?tab=flows" />
          </Col>
          <Col span={6}>
            <MetricCard
              label="生产健康"
              value={`${stats.prodStatus.running}/${prodTotal || 0}`}
              color={unhealthy > 0 ? '#f59e0b' : '#10b981'}
              icon={<HeartOutlined />}
              sub={unhealthy > 0 ? `${unhealthy} 个需关注` : '运行正常'}
              href="/impact"
            />
          </Col>
        </Row>

        {/* 两栏：分层 / 业务线 */}
        <Row gutter={12} className="mb-4">
          <Col span={12}>
            <Card size="small" title={<span className="text-[13px] font-medium text-gray-700">架构分层分布</span>} className="!mb-0">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                {stats.layerCounts.map(({ layer, count }) => (
                  <div key={layer}>
                    <div className="flex justify-between text-[11px] mb-0.5">
                      <span style={{ color: LAYER_COLORS[layer] }}>{LAYER_LABELS[layer]}</span>
                      <span className="text-gray-400">{count}</span>
                    </div>
                    <Progress percent={Math.round((count / total) * 100)} showInfo={false} strokeColor={LAYER_COLORS[layer]} size="small" />
                  </div>
                ))}
              </div>
            </Card>
          </Col>
          <Col span={12}>
            <Card size="small" title={<span className="text-[13px] font-medium text-gray-700">业务线系统分布</span>} className="!mb-0">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                {stats.blCounts.map(({ bl, label, color, count }) => (
                  <div key={bl}>
                    <div className="flex justify-between text-[11px] mb-0.5">
                      <span style={{ color }}>{label}</span>
                      <span className="text-gray-400">{count}</span>
                    </div>
                    <Progress percent={Math.round((count / total) * 100)} showInfo={false} strokeColor={color} size="small" />
                  </div>
                ))}
              </div>
            </Card>
          </Col>
        </Row>

        {/* 两栏：生产健康 / 关系类型 */}
        <Row gutter={12} className="mb-4">
          <Col span={12}>
            <Card size="small" title={<span className="text-[13px] font-medium text-gray-700">生产环境健康状态</span>} className="!mb-0">
              <div className="flex items-end gap-4 h-32 px-2">
                {(Object.keys(stats.prodStatus) as EnvStatus[]).map((st) => {
                  const v = stats.prodStatus[st]
                  const h = prodTotal ? Math.max((v / prodTotal) * 100, v > 0 ? 8 : 0) : 0
                  return (
                    <div key={st} className="flex-1 flex flex-col items-center gap-1.5">
                      <span className="text-sm font-semibold" style={{ color: STATUS_COLORS[st] }}>{v}</span>
                      <div className="w-full rounded-t-md" style={{ height: `${h}%`, maxHeight: 100, backgroundColor: STATUS_COLORS[st], opacity: 0.85 }} />
                      <span className="text-[10px] text-gray-400">{STATUS_LABELS[st]}</span>
                    </div>
                  )
                })}
              </div>
            </Card>
          </Col>
          <Col span={12}>
            <Card size="small" title={<span className="text-[13px] font-medium text-gray-700">调用关系类型分布</span>} className="!mb-0">
              {Object.entries(stats.relTypes).map(([rt, cnt]) => (
                <div key={rt} className="flex items-center gap-2 mb-1.5 last:mb-0">
                  <span className="text-[11px] text-gray-600 w-20">{rt}</span>
                  <div className="flex-1">
                    <Progress percent={Math.round((cnt / Math.max(data.relations.length, 1)) * 100)} showInfo={false} strokeColor="#2563eb" size="small" />
                  </div>
                  <span className="text-[11px] text-gray-400 w-8 text-right">{cnt}</span>
                </div>
              ))}
            </Card>
          </Col>
        </Row>

        {/* 业务流按域分组：域为标题行 + 流为紧凑行 */}
        <Card
          size="small"
          title={
            <span className="flex items-center gap-2 text-[13px] font-medium text-gray-700">
              <ApartmentOutlined />
              核心业务流
              <span className="text-[11px] text-gray-400 font-normal">({stats.totalFlows} 条 · {stats.domainCounts.length} 域)</span>
            </span>
          }
          extra={<Link href="/processes?tab=flows" className="text-xs text-blue-500 flex items-center gap-0.5">查看全部 <ArrowRightOutlined /></Link>}
          className="!mb-0"
        >
          {stats.domainCounts.map(({ dom, count }) => (
            <div key={dom} className="mb-4 last:mb-0">
              <Tooltip title={domainMaps.descriptions[dom] || undefined}>
                <div className="flex items-center gap-2 mb-2 w-fit">
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: domainMaps.colors[dom] }} />
                  {domainMaps.icons[dom] && <span className="text-[12px]">{domainMaps.icons[dom]}</span>}
                  <span className="text-[12px] font-medium" style={{ color: domainMaps.colors[dom] }}>{domainMaps.labels[dom]}</span>
                  <span className="text-[10px] text-gray-400">{count} 条</span>
                </div>
              </Tooltip>
              <div className="grid grid-cols-2 gap-2">
                {(data.businessFlows || []).filter((f) => f.domain === dom).map((f) => (
                  <Link
                    key={f.id}
                    href={`/processes?tab=flows&flow=${f.id}`}
                    className="flex items-center gap-2.5 rounded-lg border border-gray-200 px-3 py-2 hover:border-blue-300 hover:bg-blue-50/40 transition-all group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-medium text-gray-700 group-hover:text-blue-700 truncate">{f.name}</span>
                        {f.criticality && (
                          <Tag
                            className="!text-[9px] !py-0 !px-1 !leading-3 flex-shrink-0"
                            color={CRITICALITY_COLORS[f.criticality as keyof typeof CRITICALITY_COLORS]}
                          >
                            {f.criticality}
                          </Tag>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-400 truncate mt-0.5">{f.description}</div>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                      <span className="text-[9px] text-gray-300">{f.steps.length} 步</span>
                      {f.owner && <span className="text-[9px] text-gray-400">{f.owner}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
