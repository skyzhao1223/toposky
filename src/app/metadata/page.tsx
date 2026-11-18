'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Card, Col, Row, Statistic, Table, Tabs, Tag, Progress, Typography, Spin, Space, Empty,
  Segmented, Button, Input, Select, message, Popconfirm, Drawer, Alert, Modal,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  DatabaseOutlined, LinkOutlined, ApartmentOutlined, TagsOutlined, PartitionOutlined,
  SaveOutlined, PlusOutlined, DeleteOutlined, EditOutlined,
} from '@ant-design/icons'
import {
  TopologyData, SystemNode, SystemRelation, AppType, SystemLayer,
  BusinessLineConfig, BusinessFlow, ProcessInfo, ProcessHost, ProcessDependency, BusinessFlowDomain, BusinessLine, EnvType, Criticality, ContractKind,
  DomainDef, resolveDomainId,
  APP_TYPE_LABELS, LAYER_LABELS, buildProcessHostMaps, buildDomainMaps, nodeLayer, deriveScope, SCOPE_LABELS, SCOPE_COLORS, ENV_LABELS,
  RELATION_LABELS, CONTRACT_KIND_LABELS, CRITICALITY_COLORS, buildBusinessLineMaps,
  CONFIDENCE_COLORS, CONFIDENCE_LABELS,
} from '@/types'
import { describeEvidence, confidenceUsage } from '@/lib/evidence'
import { saveTopology } from '@/services/topology'
import { useTopology } from '@/hooks/useTopology'
import { useAuthor } from '@/hooks/useAuthor'
import { applySaveResult } from '@/utils/saveFeedback'
import AuthorControl from '@/components/AuthorControl'
import { DEMO_MODE } from '@/lib/demoMode'

const { Title, Paragraph } = Typography

type Surface = 'full' | 'partial' | 'hidden'
type Mode = 'inventory' | 'edit'

interface FieldRow {
  key: string
  label: string
  desc: string
  surface: Surface
  where: string
  filled: number
  total: number
}

const CRITICALITY_OPTIONS: { value: Criticality; label: string }[] = [
  { value: 'P0', label: 'P0 · 最高' },
  { value: 'P1', label: 'P1 · 高' },
  { value: 'P2', label: 'P2 · 中' },
  { value: 'P3', label: 'P3 · 低' },
]

const SURFACE_META: Record<Surface, { label: string; color: string }> = {
  full: { label: '已展示', color: 'green' },
  partial: { label: '部分展示', color: 'orange' },
  hidden: { label: '未展示', color: 'default' },
}

function filledCount<T>(arr: T[], get: (x: T) => unknown): number {
  return arr.reduce((s, x) => {
    const v = get(x)
    if (v === undefined || v === null || v === '') return s
    if (Array.isArray(v) && v.length === 0) return s
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0) return s
    return s + 1
  }, 0)
}

function FieldTable({ rows }: { rows: FieldRow[] }) {
  const columns: ColumnsType<FieldRow> = [
    {
      title: '字段',
      key: 'field',
      width: 200,
      render: (_, r) => (
        <div>
          <div className="font-medium text-gray-800 text-[13px]">{r.label}</div>
          <div className="text-[10px] text-gray-400 font-mono">{r.key}</div>
        </div>
      ),
    },
    { title: '说明', dataIndex: 'desc', key: 'desc', render: (d) => <span className="text-[12px] text-gray-600">{d}</span> },
    {
      title: '填充率',
      key: 'coverage',
      width: 180,
      render: (_, r) => {
        const pct = r.total ? Math.round((r.filled / r.total) * 100) : 0
        return (
          <div className="flex items-center gap-2">
            <Progress percent={pct} size="small" showInfo={false} className="!mb-0 flex-1" strokeColor={pct === 0 ? '#d9d9d9' : pct === 100 ? '#52c41a' : '#1677ff'} />
            <span className="text-[11px] text-gray-400 w-14 text-right flex-shrink-0">{r.filled}/{r.total}</span>
          </div>
        )
      },
    },
    {
      title: '状态',
      key: 'surface',
      width: 90,
      render: (_, r) => <Tag color={SURFACE_META[r.surface].color}>{SURFACE_META[r.surface].label}</Tag>,
    },
    { title: '展示位置', dataIndex: 'where', key: 'where', render: (w: string) => <span className="text-[11px] text-gray-500">{w}</span> },
  ]

  return <Table rowKey="key" size="small" columns={columns} dataSource={rows} pagination={false} />
}

type ProcessRow = ProcessInfo & {
  _domainId: string
  _domainName: string
  _groupId: string
  _groupName: string
}

export default function MetadataPage() {
  const { data: shared, loading: sharedLoading, refresh } = useTopology()
  const [data, setData] = useState<TopologyData>({ nodes: [], relations: [] })
  const [mode, setMode] = useState<Mode>('inventory')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null)
  const [author, updateAuthor] = useAuthor()

  // 新增流程弹窗
  const [addProcOpen, setAddProcOpen] = useState(false)
  const [addProcDomain, setAddProcDomain] = useState<string>('')
  const [addProcGroup, setAddProcGroup] = useState<string>('')
  const [addProcId, setAddProcId] = useState('')
  const [addProcName, setAddProcName] = useState('')

  const prevSharedRef = useRef<TopologyData | null>(null)

  // 跟随共享缓存：外部（其他页面）保存后，未脏时自动同步，已脏时提醒
  useEffect(() => {
    if (sharedLoading) return
    const prev = prevSharedRef.current
    if (prev === shared) return
    prevSharedRef.current = shared
    if (dirty) {
      message.warning('数据已被其他页面更新并保存，你的未保存修改基于旧版本，保存时可能冲突')
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 同步外部共享数据到本地编辑副本
      setData(shared)
    }
  }, [shared, sharedLoading, dirty])

  // 未保存修改的离开保护
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const loading = sharedLoading && data.nodes.length === 0

  const blMaps = useMemo(() => buildBusinessLineMaps(data), [data])
  const blOptions = useMemo(() => Object.entries(blMaps.labels).map(([value, label]) => ({ value, label })), [blMaps])
  const domainMaps = useMemo(() => buildDomainMaps(data), [data])
  const domainOptions = useMemo(() => domainMaps.domains.map((d) => ({ value: d.id, label: d.name })), [domainMaps])
  const hostOptions = useMemo(
    () => buildProcessHostMaps(data).hosts.map((h) => ({ value: h.id, label: h.name })),
    [data],
  )
  const appTypeOptions = useMemo(() => Object.entries(APP_TYPE_LABELS).map(([value, label]) => ({ value, label })), [])
  const layerOptions = useMemo(() => Object.entries(LAYER_LABELS).map(([value, label]) => ({ value, label })), [])
  const envOptions = useMemo(() => Object.entries(ENV_LABELS).map(([value, label]) => ({ value, label })), [])
  const nodeOptions = useMemo(() => data.nodes.map((n) => ({ value: n.id, label: n.name })), [data.nodes])
  const flowOptions = useMemo(() => (data.businessFlows || []).map((f) => ({ value: f.id, label: f.name })), [data.businessFlows])
  const processList: ProcessRow[] = useMemo(
    () =>
      (data.processCatalog?.domains || []).flatMap((dom) =>
        dom.groups.flatMap((g) =>
          g.processes.map((p) => ({ ...p, _domainId: dom.id, _domainName: dom.name, _groupId: g.id, _groupName: g.name })),
        ),
      ),
    [data.processCatalog],
  )
  const processOptions = useMemo(() => processList.map((p) => ({ value: p.id, label: p.name })), [processList])

  const patch = (updater: (d: TopologyData) => TopologyData) => {
    setData(updater)
    setDirty(true)
  }
  const updateNode = (id: string, p: Partial<SystemNode>) =>
    patch((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...p } : n)) }))
  const updateRelation = (id: string, p: Partial<SystemRelation>) =>
    patch((d) => ({ ...d, relations: d.relations.map((r) => (r.id === id ? { ...r, ...p } : r)) }))
  const updateBusinessLine = (id: string, p: Partial<BusinessLineConfig>) =>
    patch((d) => ({ ...d, businessLines: (d.businessLines || []).map((x) => (x.id === id ? { ...x, ...p } : x)) }))

  const addFlow = () =>
    patch((d) => ({
      ...d,
      businessFlows: [
        ...(d.businessFlows || []),
        { id: `flow-${Date.now().toString(36)}`, name: '新业务流', description: '', category: '', steps: [] },
      ],
    }))

  /** 删除业务流，并级联清理流程目录中对它的引用 */
  const deleteFlow = (id: string) => {
    if (editingFlowId === id) setEditingFlowId(null)
    patch((d) => {
      const pc = d.processCatalog
        ? {
            ...d.processCatalog,
            domains: d.processCatalog.domains.map((dom) => ({
              ...dom,
              groups: dom.groups.map((g) => ({
                ...g,
                processes: g.processes.map((p) =>
                  p.flows?.includes(id) ? { ...p, flows: p.flows.filter((f) => f !== id) } : p,
                ),
              })),
            })),
          }
        : d.processCatalog
      return { ...d, businessFlows: (d.businessFlows || []).filter((f) => f.id !== id), processCatalog: pc }
    })
  }

  const addProcess = (domainId: string, groupId: string, id: string, name: string) =>
    patch((d) => {
      const pc = d.processCatalog
      if (!pc) return d
      return {
        ...d,
        processCatalog: {
          ...pc,
          domains: pc.domains.map((dom) =>
            dom.id === domainId
              ? { ...dom, groups: dom.groups.map((g) => (g.id === groupId ? { ...g, processes: [...g.processes, { id, name }] } : g)) }
              : dom,
          ),
        },
      }
    })

  /** 删除流程，并级联清理依赖中对它的引用 */
  const deleteProcess = (id: string) =>
    patch((d) => {
      const pc = d.processCatalog
      if (!pc) return d
      return {
        ...d,
        processCatalog: {
          ...pc,
          domains: pc.domains.map((dom) => ({
            ...dom,
            groups: dom.groups.map((g) => ({ ...g, processes: g.processes.filter((p) => p.id !== id) })),
          })),
          dependencies: pc.dependencies.filter((dep) => dep.from !== id && dep.to !== id),
        },
      }
    })

  const updateFlow = (id: string, p: Partial<BusinessFlow>) =>
    patch((d) => ({ ...d, businessFlows: (d.businessFlows || []).map((f) => (f.id === id ? { ...f, ...p } : f)) }))
  const updateProcess = (id: string, p: Partial<ProcessInfo>) =>
    patch((d) => {
      const pc = d.processCatalog
      if (!pc) return d
      return {
        ...d,
        processCatalog: {
          ...pc,
          domains: pc.domains.map((dom) => ({
            ...dom,
            groups: dom.groups.map((g) => ({
              ...g,
              processes: g.processes.map((proc) => (proc.id === id ? { ...proc, ...p } : proc)),
            })),
          })),
        },
      }
    })
  const updateDependency = (index: number, p: Partial<ProcessDependency>) =>
    patch((d) => {
      const pc = d.processCatalog
      if (!pc) return d
      return { ...d, processCatalog: { ...pc, dependencies: pc.dependencies.map((x, i) => (i === index ? { ...x, ...p } : x)) } }
    })
  const addDependency = () =>
    patch((d) => {
      const pc = d.processCatalog
      if (!pc) return d
      return { ...d, processCatalog: { ...pc, dependencies: [...pc.dependencies, { from: '', to: '', type: '', note: '' }] } }
    })
  const deleteDependency = (index: number) =>
    patch((d) => {
      const pc = d.processCatalog
      if (!pc) return d
      return { ...d, processCatalog: { ...pc, dependencies: pc.dependencies.filter((_, i) => i !== index) } }
    })

  const handleReload = () => {
    setDirty(false)
    refresh()
  }

  const handleSave = async () => {
    if (DEMO_MODE) {
      message.warning('演示模式为只读：请在本地运行 npm run dev 后编辑。')
      return
    }
    setSaving(true)
    try {
      const result = await saveTopology(data, {
        author: author.name || undefined,
        email: author.email || undefined,
        message: '更新元数据',
      })
      if (applySaveResult(result, { onReload: handleReload })) {
        setDirty(false)
      }
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const nodeRows: FieldRow[] = useMemo(() => {
    const n = data.nodes
    const t = n.length
    return [
      { key: 'id', label: '标识', desc: '系统唯一 id，流程/关系关联的依据', surface: 'partial', where: '资产目录、流程详情关联', filled: filledCount(n, (x) => x.id), total: t },
      { key: 'name', label: '名称', desc: '系统展示名称', surface: 'full', where: '拓扑图、资产目录、节点悬浮', filled: filledCount(n, (x) => x.name), total: t },
      { key: 'description', label: '描述', desc: '系统职责与功能说明', surface: 'full', where: '节点悬浮、资产详情', filled: filledCount(n, (x) => x.description), total: t },
      { key: 'category', label: '分类（兼容）', desc: '已废弃：与 layer 等价，仅保留于 JSON 兼容旧数据', surface: 'hidden', where: '—（UI 已统一使用 layer）', filled: filledCount(n, (x) => x.category), total: t },
      { key: 'appType', label: '应用类型', desc: '前端/后端/BFF/全栈', surface: 'full', where: '资产目录类型列、节点悬浮、配置面板、本页编辑', filled: filledCount(n, (x) => x.appType), total: t },
      { key: 'businessLine', label: '业务线', desc: '所属业务线归属', surface: 'full', where: '资产目录、拓扑聚类、本页编辑', filled: filledCount(n, (x) => x.businessLine), total: t },
      { key: 'layer', label: '架构分层', desc: '接入/应用/平台/中间件/基础设施/外部（唯一结构轴 + 配色 SSOT）', surface: 'full', where: '拓扑分层、资产目录、配置面板、本页编辑', filled: filledCount(n, (x) => x.layer), total: t },
      { key: 'scope', label: '粒度', desc: '派生（不落盘）：系统/服务/组件，由 layer + appType 推出', surface: 'partial', where: '资产目录粒度列、节点悬浮徽标', filled: t, total: t },
      { key: 'domain', label: '业务域', desc: '派生（不落盘）：由参与的业务流 / 流程反推，可多域', surface: 'partial', where: '流程视图、影响分析', filled: t, total: t },
      { key: 'owner', label: '负责人', desc: '内部负责团队/个人', surface: 'full', where: '资产目录、节点悬浮、本页编辑', filled: filledCount(n, (x) => x.owner), total: t },
      { key: 'vendor', label: '供应商/外部方', desc: '外部系统所属供应商名称（owner 仅填内部团队）', surface: 'full', where: '节点悬浮、资产详情、本页编辑', filled: filledCount(n, (x) => x.vendor), total: t },
      { key: 'contacts', label: '联系人', desc: '内部/供应商联系人（姓名、角色、电话、邮箱、IM、备注）', surface: 'full', where: '节点悬浮、资产详情、配置面板', filled: filledCount(n, (x) => x.contacts && x.contacts.length > 0), total: t },
      { key: 'url', label: '访问地址', desc: '系统级访问入口', surface: 'full', where: '资产详情、节点悬浮、本页编辑', filled: filledCount(n, (x) => x.url), total: t },
      { key: 'links', label: '相关链接', desc: 'repo/ones/wiki/ci/monitoring', surface: 'full', where: '节点悬浮、右键菜单', filled: filledCount(n, (x) => x.links), total: t },
      { key: 'environments', label: '环境', desc: 'dev/test/staging/production 状态与版本', surface: 'full', where: '节点悬浮、资产详情、生产健康', filled: filledCount(n, (x) => x.environments), total: t },
      { key: 'color', label: '自定义颜色', desc: '节点自定义配色（当前未启用）', surface: 'hidden', where: '—（配色由分类/业务线决定）', filled: filledCount(n, (x) => x.color), total: t },
      { key: 'position', label: '坐标', desc: '拓扑图布局位置（拖拽持久化）', surface: 'partial', where: '拓扑图拖拽保存', filled: filledCount(n, (x) => x.position), total: t },
    ]
  }, [data.nodes])

  const relationRows: FieldRow[] = useMemo(() => {
    const r = data.relations
    const t = r.length
    return [
      { key: 'source', label: '来源', desc: '关系起点系统 id', surface: 'full', where: '拓扑图、资产详情、配置面板', filled: filledCount(r, (x) => x.source), total: t },
      { key: 'target', label: '目标', desc: '关系终点系统 id', surface: 'full', where: '拓扑图、资产详情、配置面板', filled: filledCount(r, (x) => x.target), total: t },
      { key: 'relationType', label: '关系类型', desc: '依赖/调用/消息/同步/部署', surface: 'full', where: '拓扑边标签、关系表', filled: filledCount(r, (x) => x.relationType), total: t },
      { key: 'label', label: '标签', desc: '关系简短说明', surface: 'full', where: '拓扑边标签、资产详情、关系表、本页编辑', filled: filledCount(r, (x) => x.label), total: t },
      { key: 'description', label: '详细描述', desc: '关系的完整说明', surface: 'full', where: '关系表说明列、资产详情、本页编辑', filled: filledCount(r, (x) => x.description), total: t },
      { key: 'environments', label: '适用环境', desc: '该关系存在的环境（空=全部）', surface: 'full', where: '关系表环境列、资产详情、本页编辑', filled: filledCount(r, (x) => x.environments), total: t },
      { key: 'contract', label: '依赖契约', desc: '这条边具体走的接口/方法/topic/表（代码级落点）', surface: 'partial', where: '配置面板、影响面契约段', filled: filledCount(r, (x) => x.contract), total: t },
    ]
  }, [data.relations])

  const domainRows: DomainDef[] = domainMaps.domains
  const blRows: FieldRow[] = useMemo(() => {
    const b = data.businessLines || []
    const t = b.length
    return [
      { key: 'id', label: '标识', desc: '业务线唯一 id', surface: 'full', where: '配置面板', filled: filledCount(b, (x) => x.id), total: t },
      { key: 'name', label: '名称', desc: '业务线展示名', surface: 'full', where: '资产目录、拓扑聚类、本页编辑', filled: filledCount(b, (x) => x.name), total: t },
      { key: 'color', label: '颜色', desc: '业务线配色', surface: 'full', where: '拓扑聚类、资产目录、本页编辑', filled: filledCount(b, (x) => x.color), total: t },
      { key: 'description', label: '说明', desc: '业务线职责范围', surface: 'full', where: '配置面板、本页编辑', filled: filledCount(b, (x) => x.description), total: t },
      { key: 'owner', label: '负责人', desc: '业务线负责团队', surface: 'full', where: '配置面板、本页编辑', filled: filledCount(b, (x) => x.owner), total: t },
      { key: 'group', label: '所属分组', desc: '业务线分组归属', surface: 'full', where: '配置面板', filled: filledCount(b, (x) => x.group), total: t },
    ]
  }, [data.businessLines])

  const flowRows: FieldRow[] = useMemo(() => {
    const f = data.businessFlows || []
    const t = f.length
    return [
      { key: 'name', label: '名称', desc: '业务流名称', surface: 'full', where: '总览、业务流视图、拓扑业务流条、本页编辑', filled: filledCount(f, (x) => x.name), total: t },
      { key: 'description', label: '描述', desc: '业务流说明', surface: 'full', where: '总览、业务流视图、本页编辑', filled: filledCount(f, (x) => x.description), total: t },
      { key: 'domain', label: '业务域', desc: '财务/人力/差旅/合同/支撑/对外', surface: 'full', where: '总览、业务流视图、本页编辑', filled: filledCount(f, (x) => x.domain), total: t },
      { key: 'businessLine', label: '业务线（主责）', desc: '业务流的主责业务线', surface: 'full', where: '业务流详情、本页编辑', filled: filledCount(f, (x) => x.businessLine), total: t },
      { key: 'owner', label: '负责人', desc: '业务流负责团队', surface: 'full', where: '总览、业务流视图、本页编辑', filled: filledCount(f, (x) => x.owner), total: t },
      { key: 'criticality', label: '关键级别', desc: 'P0-P3', surface: 'full', where: '总览、影响分析、业务流视图、本页编辑', filled: filledCount(f, (x) => x.criticality), total: t },
      { key: 'trigger', label: '触发条件', desc: '业务流触发方式', surface: 'full', where: '业务流详情、本页编辑', filled: filledCount(f, (x) => x.trigger), total: t },
      { key: 'kpi', label: 'KPI', desc: '业务流指标', surface: 'full', where: '业务流详情、本页编辑', filled: filledCount(f, (x) => x.kpi), total: t },
      { key: 'steps', label: '步骤', desc: '步骤节点与标签序列', surface: 'full', where: '业务流视图、拓扑高亮、本页编辑', filled: filledCount(f, (x) => x.steps), total: t },
    ]
  }, [data.businessFlows])

  const processRows: FieldRow[] = useMemo(() => {
    const deps = data.processCatalog?.dependencies || []
    const t = processList.length
    return [
      { key: 'process.name', label: '流程名称', desc: '流程展示名', surface: 'full', where: '流程目录树、流程图、详情、本页编辑', filled: filledCount(processList, (x) => x.name), total: t },
      { key: 'process.nameEn', label: '英文名', desc: '流程英文名', surface: 'full', where: '流程详情、本页编辑', filled: filledCount(processList, (x) => x.nameEn), total: t },
      { key: 'process.desc', label: '描述', desc: '流程说明', surface: 'full', where: '流程详情、本页编辑', filled: filledCount(processList, (x) => x.desc), total: t },
      { key: 'process.systems', label: '关联系统', desc: '流程关联的系统节点 id', surface: 'full', where: '流程详情关联系统、本页编辑', filled: filledCount(processList, (x) => x.systems), total: t },
      { key: 'process.flows', label: '关联业务流', desc: '实现该流程的业务流 id', surface: 'full', where: '流程详情关联业务流、本页编辑', filled: filledCount(processList, (x) => x.flows), total: t },
      { key: 'dependency.type', label: '依赖类型', desc: '触发/流向/提供/依赖等', surface: 'full', where: '流程详情上下游、本页编辑', filled: filledCount(deps, (x) => x.type), total: deps.length },
      { key: 'dependency.note', label: '依赖说明', desc: '依赖关系补充说明', surface: 'full', where: '流程详情上下游、本页编辑', filled: filledCount(deps, (x) => x.note), total: deps.length },
    ]
  }, [data.processCatalog, processList])

  const appTypeCounts = useMemo(() => {
    const m: Record<string, number> = {}
    data.nodes.forEach((n) => { const k = n.appType ? (APP_TYPE_LABELS[n.appType] || n.appType) : '未填'; m[k] = (m[k] || 0) + 1 })
    return m
  }, [data.nodes])

  const depTypeCounts = useMemo(() => {
    const m: Record<string, number> = {}
    ;(data.processCatalog?.dependencies || []).forEach((d) => { const k = d.type || '未填'; m[k] = (m[k] || 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [data.processCatalog])

  const totalProcesses = processList.length

  const allRows = useMemo(() => [...nodeRows, ...relationRows, ...blRows, ...flowRows, ...processRows], [nodeRows, relationRows, blRows, flowRows, processRows])
  const hiddenRows = allRows.filter((r) => r.surface === 'hidden')
  const partialRows = allRows.filter((r) => r.surface === 'partial')

  /* ===================== 编辑表格 ===================== */

  const nodeEditColumns: ColumnsType<SystemNode> = [
    {
      title: '名称', dataIndex: 'name', key: 'name', width: 170, fixed: 'left',
      render: (name: string, r) => (
        <div>
          <div className="text-[13px] text-gray-800">{name}</div>
          <div className="text-[10px] text-gray-400 font-mono">{r.id}</div>
        </div>
      ),
    },
    { title: '粒度', key: 'scope', width: 90, render: (_, r) => { const s = deriveScope(nodeLayer(r), r.appType); return <span style={{ color: SCOPE_COLORS[s] }}>{SCOPE_LABELS[s]}</span> } },
    {
      title: '应用类型', key: 'appType', width: 130,
      render: (_, r) => (
        <Select size="small" className="w-full" allowClear placeholder="未填" value={r.appType}
          onChange={(v: AppType | undefined) => updateNode(r.id, { appType: v })} options={appTypeOptions} />
      ),
    },
    {
      title: '架构分层', key: 'layer', width: 150,
      render: (_, r) => (
        <Select size="small" className="w-full" allowClear placeholder="未填" value={r.layer}
          onChange={(v: SystemLayer | undefined) => updateNode(r.id, { layer: v })} options={layerOptions} />
      ),
    },
    {
      title: '业务线', key: 'businessLine', width: 150,
      render: (_, r) => (
        <Select size="small" className="w-full" allowClear placeholder="未填" value={r.businessLine}
          onChange={(v: BusinessLine | undefined) => updateNode(r.id, { businessLine: v })} options={blOptions} />
      ),
    },
    { title: '负责人', key: 'owner', width: 150, render: (_, r) => <Input size="small" value={r.owner} placeholder="未填" onChange={(e) => updateNode(r.id, { owner: e.target.value })} /> },
    { title: '供应商', key: 'vendor', width: 140, render: (_, r) => <Input size="small" value={r.vendor} placeholder="未填" onChange={(e) => updateNode(r.id, { vendor: e.target.value })} /> },
    { title: '联系人', key: 'contacts', width: 90, render: (_, r) => <span className="text-xs text-gray-500">{r.contacts && r.contacts.length > 0 ? `${r.contacts.length} 人` : '-'}</span> },
    { title: '访问地址', key: 'url', width: 200, render: (_, r) => <Input size="small" value={r.url} placeholder="未填" onChange={(e) => updateNode(r.id, { url: e.target.value })} /> },
    { title: '描述', key: 'description', render: (_, r) => <Input size="small" value={r.description} onChange={(e) => updateNode(r.id, { description: e.target.value })} /> },
  ]

  const relationEditColumns: ColumnsType<SystemRelation> = [
    {
      title: '来源 → 目标', key: 'ends', width: 260, fixed: 'left',
      render: (_, r) => (
        <span className="text-[12px]">
          <span className="text-gray-700">{data.nodes.find((n) => n.id === r.source)?.name || r.source}</span>
          <span className="mx-1 text-gray-300">→</span>
          <span className="text-gray-700">{data.nodes.find((n) => n.id === r.target)?.name || r.target}</span>
        </span>
      ),
    },
    { title: '类型', dataIndex: 'relationType', key: 'relationType', width: 90, render: (rt: SystemRelation['relationType']) => <Tag>{RELATION_LABELS[rt]}</Tag> },
    { title: '标签', key: 'label', width: 180, render: (_, r) => <Input size="small" value={r.label} placeholder="未填" onChange={(e) => updateRelation(r.id, { label: e.target.value })} /> },
    { title: '详细描述', key: 'description', render: (_, r) => <Input size="small" value={r.description} placeholder="未填" onChange={(e) => updateRelation(r.id, { description: e.target.value })} /> },
    {
      title: '契约', key: 'contract', width: 220,
      render: (_, r) => (
        <div className="flex flex-col gap-1">
          <Select
            size="small" allowClear placeholder="契约类型" value={r.contract?.kind}
            onChange={(v: ContractKind | undefined) => updateRelation(r.id, { contract: { ...(r.contract || {}), kind: v } })}
            options={Object.entries(CONTRACT_KIND_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <Input
            size="small" placeholder="接口/方法/topic/表" value={r.contract?.target}
            onChange={(e) => updateRelation(r.id, { contract: { ...(r.contract || {}), target: e.target.value || undefined } })}
          />
        </div>
      ),
    },
    {
      // 可信度与证据由验证器产出，这里只读展示（避免手改覆盖机器结论）
      title: '可信度', key: 'confidence', width: 120,
      render: (_, r) => {
        const ev = describeEvidence(r)
        return (
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1 text-[12px]" title={confidenceUsage(ev.confidence)}>
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: CONFIDENCE_COLORS[ev.confidence] }} />
              <span style={{ color: CONFIDENCE_COLORS[ev.confidence] }}>{CONFIDENCE_LABELS[ev.confidence]}</span>
            </span>
            {!ev.verified && <span className="text-[10px] text-orange-500">未核实</span>}
            {ev.needsReview && <span className="text-[10px] text-gray-400">需复核</span>}
          </div>
        )
      },
    },
    {
      title: '证据（出处）', key: 'evidence', width: 250,
      render: (_, r) => {
        const ev = describeEvidence(r)
        return (
          <div className="text-[11px] leading-tight" title={ev.headline + (ev.note ? '\n' + ev.note : '')}>
            <div className="text-gray-600">{ev.kindLabel || '无来源'} · {ev.verdictLabel || '未核实'}</div>
            {ev.ref && <code className="text-gray-400 text-[10px] break-all">{ev.ref}</code>}
          </div>
        )
      },
    },
    {
      title: '适用环境', key: 'environments', width: 230,
      render: (_, r) => (
        <Select size="small" mode="multiple" className="w-full" allowClear placeholder="全部" value={r.environments || []}
          onChange={(v: EnvType[]) => updateRelation(r.id, { environments: v.length ? v : undefined })} options={envOptions} />
      ),
    },
  ]

  const businessLineEditColumns: ColumnsType<BusinessLineConfig> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 130, fixed: 'left', render: (id: string) => <span className="font-mono text-[11px] text-gray-500">{id}</span> },
    { title: '名称', key: 'name', width: 150, render: (_, r) => <Input size="small" value={r.name} onChange={(e) => updateBusinessLine(r.id, { name: e.target.value })} /> },
    { title: '颜色', key: 'color', width: 80, render: (_, r) => <Input size="small" type="color" className="w-full h-7" value={r.color} onChange={(e) => updateBusinessLine(r.id, { color: e.target.value })} /> },
    { title: '负责人', key: 'owner', width: 150, render: (_, r) => <Input size="small" value={r.owner} placeholder="未填" onChange={(e) => updateBusinessLine(r.id, { owner: e.target.value })} /> },
    { title: '说明', key: 'description', render: (_, r) => <Input size="small" value={r.description} placeholder="未填" onChange={(e) => updateBusinessLine(r.id, { description: e.target.value })} /> },
  ]

  const flowEditColumns: ColumnsType<BusinessFlow> = [
    {
      title: '名称', key: 'name', width: 190, fixed: 'left',
      render: (_, r) => (
        <div>
          <Input size="small" value={r.name} onChange={(e) => updateFlow(r.id, { name: e.target.value })} />
          <div className="text-[10px] text-gray-400 font-mono mt-0.5">{r.id}</div>
        </div>
      ),
    },
    {
      title: '业务域', key: 'domain', width: 130,
      render: (_, r) => (
        <Select size="small" className="w-full" allowClear placeholder="未填" value={r.domain}
          onChange={(v: BusinessFlowDomain | undefined) => updateFlow(r.id, { domain: v })} options={domainOptions} />
      ),
    },
    { title: '业务线', key: 'businessLine', width: 150, render: (_, r) => (
      <Select size="small" className="w-full" allowClear placeholder="未填" value={r.businessLine}
        onChange={(v: BusinessLine | undefined) => updateFlow(r.id, { businessLine: v })} options={blOptions} />
    ) },
    { title: '负责人', key: 'owner', width: 130, render: (_, r) => <Input size="small" value={r.owner} placeholder="未填" onChange={(e) => updateFlow(r.id, { owner: e.target.value })} /> },
    {
      title: '关键级别', key: 'criticality', width: 120,
      render: (_, r) => (
        <Select size="small" className="w-full" allowClear placeholder="未填" value={r.criticality}
          onChange={(v: Criticality | undefined) => updateFlow(r.id, { criticality: v })} options={CRITICALITY_OPTIONS}
          optionRender={(opt) => <span style={{ color: CRITICALITY_COLORS[opt.value as Criticality] }}>{opt.label}</span>} />
      ),
    },
    { title: '触发条件', key: 'trigger', width: 180, render: (_, r) => <Input size="small" value={r.trigger} placeholder="未填" onChange={(e) => updateFlow(r.id, { trigger: e.target.value })} /> },
    { title: 'KPI', key: 'kpi', width: 160, render: (_, r) => <Input size="small" value={r.kpi} placeholder="未填" onChange={(e) => updateFlow(r.id, { kpi: e.target.value })} /> },
    { title: '描述', key: 'description', render: (_, r) => <Input size="small" value={r.description} onChange={(e) => updateFlow(r.id, { description: e.target.value })} /> },
    {
      title: '步骤', key: 'steps', width: 100, fixed: 'right',
      render: (_, r) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => setEditingFlowId(r.id)}>
          {r.steps?.length || 0} 步
        </Button>
      ),
    },
    {
      title: '操作', key: 'action', width: 70, fixed: 'right',
      render: (_, r) => (
        <Popconfirm
          title="删除该业务流？"
          description="将同时清理流程目录中对它的引用"
          onConfirm={() => deleteFlow(r.id)}
        >
          <Button type="link" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  const processEditColumns: ColumnsType<ProcessRow> = [
    {
      title: '流程名称', key: 'name', width: 200, fixed: 'left',
      render: (_, r) => (
        <div>
          <Input size="small" value={r.name} onChange={(e) => updateProcess(r.id, { name: e.target.value })} />
          <div className="text-[10px] text-gray-400 font-mono mt-0.5">{r.id}</div>
        </div>
      ),
    },
    {
      title: '板块 / 流程组', key: 'path', width: 160,
      render: (_, r) => (
        <div className="text-[11px] leading-tight">
          <div className="text-gray-600">{r._domainName}</div>
          <div className="text-gray-400">{r._groupName}</div>
        </div>
      ),
    },
    { title: '英文名', key: 'nameEn', width: 150, render: (_, r) => <Input size="small" value={r.nameEn} placeholder="未填" onChange={(e) => updateProcess(r.id, { nameEn: e.target.value })} /> },
    { title: '描述', key: 'desc', render: (_, r) => <Input size="small" value={r.desc} placeholder="未填" onChange={(e) => updateProcess(r.id, { desc: e.target.value })} /> },
    {
      title: '宿主引擎', key: 'host', width: 110,
      render: (_, r) => (
        <Select size="small" className="w-full" allowClear placeholder="未填" value={r.host}
          onChange={(v: ProcessHost | undefined) => updateProcess(r.id, { host: v })} options={hostOptions} />
      ),
    },
    {
      title: '关联系统', key: 'systems', width: 240,
      render: (_, r) => (
        <Select size="small" mode="multiple" className="w-full" allowClear placeholder="未关联" value={r.systems || []}
          showSearch optionFilterProp="label" maxTagCount="responsive" options={nodeOptions}
          onChange={(v: string[]) => updateProcess(r.id, { systems: v.length ? v : undefined })} />
      ),
    },
    {
      title: '关联业务流', key: 'flows', width: 220,
      render: (_, r) => (
        <Select size="small" mode="multiple" className="w-full" allowClear placeholder="未关联" value={r.flows || []}
          showSearch optionFilterProp="label" maxTagCount="responsive" options={flowOptions}
          onChange={(v: string[]) => updateProcess(r.id, { flows: v.length ? v : undefined })} />
      ),
    },
    {
      title: '操作', key: 'action', width: 70, fixed: 'right',
      render: (_, r) => (
        <Popconfirm
          title="删除该流程？"
          description="将同时清理流程依赖中对它的引用"
          onConfirm={() => deleteProcess(r.id)}
        >
          <Button type="link" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  const deps = data.processCatalog?.dependencies || []

  const editingFlow = editingFlowId ? (data.businessFlows || []).find((f) => f.id === editingFlowId) : null
  const stepNodeOptions = nodeOptions
  const setSteps = (steps: BusinessFlow['steps']) => {
    if (!editingFlowId) return
    updateFlow(editingFlowId, { steps })
  }

  if (loading) return <div className="h-full flex items-center justify-center"><Spin size="large" description="加载中..." /></div>

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
      <div className="mx-auto" style={{ maxWidth: 1280 }}>
        <div className="flex items-end justify-between mb-4">
          <div>
            <Title level={4} className="!mb-1">元数据</Title>
            <Paragraph type="secondary" className="!mb-0">
              数据源 topology.json 的实体字段、填充率与展示位置；可切换到「数据编辑」直接维护
            </Paragraph>
          </div>
          <Space>
            <AuthorControl author={author} onChange={updateAuthor} />
            <Segmented
              value={mode}
              onChange={(v) => setMode(v as Mode)}
              options={[{ label: '字段清单', value: 'inventory' }, { label: '数据编辑', value: 'edit' }]}
            />
            {mode === 'edit' && (
              <>
                {dirty && <Tag color="orange" className="!mr-0">未保存</Tag>}
                <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!dirty || DEMO_MODE} onClick={handleSave}>
                  保存
                </Button>
              </>
            )}
          </Space>
        </div>

        <Row gutter={12} className="mb-4">
          <Col span={4}><Card size="small"><Statistic title="系统节点" value={data.nodes.length} prefix={<DatabaseOutlined />} /></Card></Col>
          <Col span={4}><Card size="small"><Statistic title="关系" value={data.relations.length} prefix={<LinkOutlined />} /></Card></Col>
          <Col span={4}><Card size="small"><Statistic title="业务线" value={(data.businessLines || []).length} prefix={<TagsOutlined />} /></Card></Col>
          <Col span={4}><Card size="small"><Statistic title="业务流" value={(data.businessFlows || []).length} prefix={<ApartmentOutlined />} /></Card></Col>
          <Col span={4}><Card size="small"><Statistic title="流程" value={totalProcesses} prefix={<PartitionOutlined />} /></Card></Col>
          <Col span={4}><Card size="small"><Statistic title="业务域" value={domainRows.length} prefix={<TagsOutlined />} /></Card></Col>
        </Row>

        <Tabs
          key={mode}
          items={[
            {
              key: 'overview',
              label: '概览',
              children: (
                <div className="space-y-4">
                  <Row gutter={12}>
                    <Col span={12}>
                      <Card size="small" title={<span className="text-[13px] font-medium text-gray-700">元数据缺口</span>}>
                        {hiddenRows.length === 0 && partialRows.length === 0 ? (
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="所有字段均已展示" />
                        ) : (
                          <div className="space-y-2">
                            {hiddenRows.map((r) => (
                              <div key={r.key} className="flex items-center gap-2">
                                <Tag color={SURFACE_META.hidden.color}>未展示</Tag>
                                <span className="text-[13px] text-gray-700">{r.label}</span>
                                <span className="text-[11px] text-gray-400 font-mono">{r.key}</span>
                              </div>
                            ))}
                            {partialRows.map((r) => (
                              <div key={r.key} className="flex items-center gap-2">
                                <Tag color={SURFACE_META.partial.color}>部分</Tag>
                                <span className="text-[13px] text-gray-700">{r.label}</span>
                                <span className="text-[11px] text-gray-400">{r.where}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    </Col>
                    <Col span={12}>
                      <Card size="small" title={<span className="text-[13px] font-medium text-gray-700">应用类型分布（appType）</span>}>
                        <div className="space-y-1.5">
                          {Object.entries(appTypeCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                            <div key={k} className="flex items-center gap-2">
                              <span className="text-[12px] text-gray-600 w-16">{k}</span>
                              <div className="flex-1">
                                <Progress percent={Math.round((v / Math.max(data.nodes.length, 1)) * 100)} showInfo={false} size="small" strokeColor="#1677ff" />
                              </div>
                              <span className="text-[11px] text-gray-400 w-8 text-right">{v}</span>
                            </div>
                          ))}
                        </div>
                      </Card>
                    </Col>
                  </Row>

                  <Card size="small" title={<span className="text-[13px] font-medium text-gray-700">流程依赖类型分布（dependency.type）</span>}>
                    <Space size={[6, 6]} wrap>
                      {depTypeCounts.map(([k, v]) => (
                        <Tag key={k} color="blue">{k} · {v}</Tag>
                      ))}
                    </Space>
                  </Card>
                </div>
              ),
            },
            {
              key: 'nodes',
              label: `系统节点 (${data.nodes.length})`,
              children: mode === 'inventory'
                ? <FieldTable rows={nodeRows} />
                : <Table rowKey="id" size="small" columns={nodeEditColumns} dataSource={data.nodes} scroll={{ x: 1300 }} pagination={{ pageSize: 20, showSizeChanger: false }} />,
            },
            {
              key: 'relations',
              label: `关系 (${data.relations.length})`,
              children: mode === 'inventory'
                ? <FieldTable rows={relationRows} />
                : <Table rowKey="id" size="small" columns={relationEditColumns} dataSource={data.relations} scroll={{ x: 1200 }} pagination={{ pageSize: 20, showSizeChanger: false }} />,
            },
            {
              key: 'domains',
              label: `业务域 (${domainRows.length})`,
              children: (
                <div className="space-y-3">
                  <Alert
                    type="info"
                    showIcon
                    message="业务域词表由数据文件 domains[] 定义（未声明时回退内置默认），此处只读。"
                    description="如需新增或调整业务域，请修改数据文件的 domains 字段（OpenAPI/JSON 编辑均可）。"
                  />
                  <Table
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={domainRows}
                    columns={[
                      { title: '图标', dataIndex: 'icon', width: 60, render: (i?: string) => <span className="text-lg">{i || '-'}</span> },
                      {
                        title: '名称', dataIndex: 'name', width: 160,
                        render: (name: string, r) => (
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: r.color }} />
                            <span style={{ color: r.color }} className="font-medium">{name}</span>
                          </span>
                        ),
                      },
                      { title: '英文名', dataIndex: 'nameEn', width: 130, render: (v?: string) => <span className="text-[12px] text-gray-500">{v || '-'}</span> },
                      { title: 'id', dataIndex: 'id', width: 90, render: (id: string) => <span className="font-mono text-[11px] text-gray-400">{id}</span> },
                      { title: '描述', dataIndex: 'description', render: (d?: string) => d || <span className="text-gray-300">-</span> },
                      {
                        title: '业务流数', key: 'flows', width: 100, align: 'right',
                        render: (_, r) => (data.businessFlows || []).filter((f) => resolveDomainId(f.domain, domainMaps.domains) === r.id).length,
                      },
                    ]}
                  />
                </div>
              ),
            },
            {
              key: 'businessLines',
              label: `业务线 (${(data.businessLines || []).length})`,
              children: mode === 'inventory'
                ? <FieldTable rows={blRows} />
                : <Table rowKey="id" size="small" columns={businessLineEditColumns} dataSource={data.businessLines || []} pagination={false} />,
            },
            {
              key: 'flows',
              label: `业务流 (${(data.businessFlows || []).length})`,
              children: mode === 'inventory' ? (
                <FieldTable rows={flowRows} />
              ) : (
                <div>
                  <div className="mb-3">
                    <Button type="dashed" icon={<PlusOutlined />} onClick={addFlow}>添加业务流</Button>
                  </div>
                  <Table rowKey="id" size="small" columns={flowEditColumns} dataSource={data.businessFlows || []} scroll={{ x: 1650 }} pagination={false} />
                </div>
              ),
            },
            {
              key: 'processes',
              label: `流程目录 (${totalProcesses})`,
              children: mode === 'inventory' ? <FieldTable rows={processRows} /> : (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-[13px] font-medium text-gray-700">流程（{processList.length}）</span>
                      <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setAddProcOpen(true)}>添加流程</Button>
                    </div>
                    <Table rowKey="id" size="small" columns={processEditColumns} dataSource={processList} scroll={{ x: 1650 }} pagination={{ pageSize: 20, showSizeChanger: false }} />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-[13px] font-medium text-gray-700">流程依赖（{deps.length}）</span>
                      <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addDependency}>添加依赖</Button>
                    </div>
                    <Table
                      rowKey={(_, i) => String(i)}
                      size="small"
                      dataSource={deps}
                      pagination={{ pageSize: 20, showSizeChanger: false }}
                      columns={[
                        {
                          title: '来源流程', key: 'from', width: 240,
                          render: (_, r: ProcessDependency, i) => (
                            <Select size="small" className="w-full" showSearch optionFilterProp="label" placeholder="选择来源" value={r.from || undefined}
                              options={processOptions} onChange={(v: string) => updateDependency(i!, { from: v })} />
                          ),
                        },
                        {
                          title: '目标流程', key: 'to', width: 240,
                          render: (_, r: ProcessDependency, i) => (
                            <Select size="small" className="w-full" showSearch optionFilterProp="label" placeholder="选择目标" value={r.to || undefined}
                              options={processOptions} onChange={(v: string) => updateDependency(i!, { to: v })} />
                          ),
                        },
                        {
                          title: '类型', key: 'type', width: 130,
                          render: (_, r: ProcessDependency, i) => <Input size="small" value={r.type} placeholder="触发/流向…" onChange={(e) => updateDependency(i!, { type: e.target.value })} />,
                        },
                        {
                          title: '说明', key: 'note',
                          render: (_, r: ProcessDependency, i) => <Input size="small" value={r.note} placeholder="未填" onChange={(e) => updateDependency(i!, { note: e.target.value })} />,
                        },
                        {
                          title: '操作', key: 'action', width: 70,
                          render: (_, __, i) => (
                            <Popconfirm title="确定删除该依赖？" onConfirm={() => deleteDependency(i!)}>
                              <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          ),
                        },
                      ]}
                    />
                  </div>
                </div>
              ),
            },
          ]}
        />
      </div>

      <Drawer
        title={editingFlow ? `编辑步骤 · ${editingFlow.name}` : '编辑步骤'}
        open={!!editingFlowId}
        onClose={() => setEditingFlowId(null)}
        width={520}
        extra={<Button type="primary" onClick={() => setEditingFlowId(null)}>完成</Button>}
      >
        {editingFlow && (
          <div className="space-y-2">
            {(editingFlow.steps || []).map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 text-xs text-gray-400 text-right">{i + 1}</span>
                <Select
                  className="flex-1" size="small" showSearch optionFilterProp="label" placeholder="选择系统"
                  value={s.nodeId || undefined} options={stepNodeOptions}
                  onChange={(v: string) => setSteps(editingFlow.steps.map((x, j) => (j === i ? { ...x, nodeId: v } : x)))}
                />
                <Input
                  className="flex-1" size="small" placeholder="步骤说明" value={s.label}
                  onChange={(e) => setSteps(editingFlow.steps.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                />
                <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setSteps(editingFlow.steps.filter((_, j) => j !== i))} />
              </div>
            ))}
            <Button type="dashed" block icon={<PlusOutlined />} onClick={() => setSteps([...(editingFlow.steps || []), { nodeId: '', label: '' }])}>
              添加步骤
            </Button>
          </div>
        )}
      </Drawer>

      <Modal
        title="添加流程"
        open={addProcOpen}
        okText="添加"
        cancelText="取消"
        onCancel={() => setAddProcOpen(false)}
        onOk={() => {
          const catalogDomains = data.processCatalog?.domains || []
          const domId = addProcDomain || catalogDomains[0]?.id
          const grpId = addProcGroup || catalogDomains.find((d) => d.id === domId)?.groups[0]?.id
          const name = addProcName.trim()
          if (!domId || !grpId) { message.warning('请选择板块与流程组'); return }
          if (!name) { message.warning('请输入流程名称'); return }
          const id = addProcId.trim() || `proc-${Date.now().toString(36)}`
          if (processList.some((p) => p.id === id)) { message.error(`流程 id 已存在：${id}`); return }
          addProcess(domId, grpId, id, name)
          setAddProcOpen(false)
          setAddProcDomain('')
          setAddProcGroup('')
          setAddProcId('')
          setAddProcName('')
          message.success('已添加（记得保存）')
        }}
      >
        <div className="space-y-3 mt-2">
          <div>
            <div className="text-xs text-gray-500 mb-1">板块</div>
            <Select
              className="w-full"
              placeholder="选择板块"
              value={addProcDomain || undefined}
              onChange={(v: string) => { setAddProcDomain(v); setAddProcGroup('') }}
              options={(data.processCatalog?.domains || []).map((d) => ({ value: d.id, label: d.name }))}
            />
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">流程组</div>
            <Select
              className="w-full"
              placeholder={addProcDomain ? '选择流程组' : '先选择板块'}
              value={addProcGroup || undefined}
              onChange={(v: string) => setAddProcGroup(v)}
              options={(data.processCatalog?.domains || []).find((d) => d.id === addProcDomain)?.groups.map((g) => ({ value: g.id, label: g.name })) || []}
            />
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">流程名称 *</div>
            <Input placeholder="如：月度结算" value={addProcName} onChange={(e) => setAddProcName(e.target.value)} />
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">流程 ID（留空自动生成）</div>
            <Input placeholder="如：fin.5.2" value={addProcId} onChange={(e) => setAddProcId(e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
