export type SystemLayer = 'access' | 'application' | 'platform' | 'middleware' | 'infrastructure' | 'external'

export interface LayerConfig {
  id: SystemLayer
  name: string
  description?: string
  order?: number
}

/**
 * @deprecated 仅作旧数据兼容读取；分类轴已统一为 `layer`（见 nodeLayer/LAYER_*）。
 * 仍保留在 schema 中以避免版本 diff 噪声，但不再作为 UI 展示与筛选依据。
 */
export type SystemCategory = 'platform' | 'middleware' | 'application' | 'infrastructure' | 'external'

export type EnvType = 'dev' | 'test' | 'staging' | 'production'

export type EnvStatus = 'running' | 'stopped' | 'degraded' | 'unknown'

export interface EnvInfo {
  url?: string
  deployUrl?: string
  status: EnvStatus
  version?: string
  replicas?: number
  lastDeploy?: string
  notes?: string
}

export interface SystemLinks {
  repo?: string
  ones?: string
  wiki?: string
  ci?: string
  monitoring?: string
}

/** 联系人（内部负责人或外部供应商对接人） */
export interface SystemContact {
  name: string
  /** 职务/角色，如「客户经理」「技术支持」 */
  role?: string
  phone?: string
  email?: string
  /** IM / 企业微信 / 其他即时联系方式 */
  im?: string
  note?: string
}

export type AppType = 'frontend' | 'backend' | 'bff' | 'fullstack'

export type BusinessLine = 'oa-platform' | 'transition' | 'cost-control' | 'travel' | 'hr' | 'infra' | 'form-center' | 'contract' | 'official-biz' | 'external'

export interface SystemNode {
  id: string
  name: string
  description: string
  category: SystemCategory
  appType?: AppType
  businessLine?: BusinessLine
  layer?: SystemLayer
  color?: string
  url?: string
  owner?: string
  /** 外部供应商 / 外部方名称（仅外部系统；owner 仅限内部团队） */
  vendor?: string
  /** 联系人（内部负责人或外部供应商对接人） */
  contacts?: SystemContact[]
  position?: { x: number; y: number }
  links?: SystemLinks
  environments?: Partial<Record<EnvType, EnvInfo>>
  /**
   * 归属系统 id（指向 `systems[]`）。
   * 一个系统可包含 1—N 个节点（例如一个核心系统下挂 7 个服务节点）。
   * 中间件 / 外部系统 / 横切组件不填 —— 它们不属于任何业务系统。
   */
  systemId?: string
  /**
   * 该系统在节点层的「代表节点」，每个 systemId 至多一个。
   * 系统级事实（如 `scope: 'system'` 的关系）挂在这里，视图可据此上提到系统层。
   * 未标注时由 `primaryNodeOfSystem()` 按约定派生。
   */
  systemPrimary?: boolean
  /**
   * 仓库内模块路径（如 `business/hr-attend`）。
   * 用于在一个仓库装着多个系统模块时定位到具体节点 —— 依赖树验证、代码定位都靠它。
   */
  repoPath?: string
}

/**
 * 入口层路由（`TopologyData.entryRoutes`）。
 * 来自网关（LB / Ingress）的真实转发规则：域名 → 路径 → 后端应用。
 */
export interface EntryRoute {
  /** 入口环境（如 prod / test / staging） */
  env: string
  domain: string
  /** 路径匹配式（支持 * 通配），如 `/3rd/hr*`、`/standingbook/*` */
  path: string
  /** 路由优先级；同一 (env, domain, path) 可能有多条路由指向不同上游，靠它区分 */
  priority?: number
  /** 后端应用名（上游指向的应用/工作负载） */
  target?: string
  /** 后端应用 id */
  appId?: number
  /** 写明 false 表示**未强制 HTTPS**；缺省 = 已强制 */
  https?: boolean
  /** 能对应的图谱节点（映射不确定时缺省，不猜） */
  nodeId?: string
}

/**
 * 系统级元数据注册表（`TopologyData.systems`）。
 * 「系统」是业务与台账认账的单位，「节点」是能改能发布的最小单位，二者是 1—N。
 */
export interface SystemConfig {
  id: string
  name: string
  description?: string
  /** 主责团队；节点 owner 是实例负责人，系统 owner 是业务/域负责人 */
  owner?: string
  /** 主责业务线（与节点 businessLine 同一值域） */
  businessLine?: BusinessLine
  /**
   * 是否已被外部台账/文档口径覆盖。
   * false = 图谱自有但外部文档未收录（如官网站群线不在《逐系统架构图》79 个系统内）。
   */
  documented?: boolean
}

export type RelationType = 'depends_on' | 'calls' | 'publishes_to' | 'subscribes_from' | 'syncs_with' | 'deploys_to'

/** 依赖契约类型（代码级落点：代码发现/人工维护的输出目标） */
export type ContractKind = 'http' | 'rpc' | 'mq' | 'db' | 'file' | 'other'

export const CONTRACT_KIND_LABELS: Record<ContractKind, string> = {
  http: 'HTTP 接口',
  rpc: 'RPC / 方法',
  mq: '消息 Topic',
  db: '数据库表',
  file: '文件 / 对象',
  other: '其他',
}

export interface RelationContract {
  kind?: ContractKind
  /** 契约标识：接口路径 / 方法名 / topic / 表名 / 文件路径等 */
  target?: string
  note?: string
}

/** 关系语义粒度 */
export type RelationScope = 'node' | 'system'

export const RELATION_SCOPE_LABELS: Record<RelationScope, string> = {
  node: '节点级',
  system: '系统级',
}

/**
 * 证据强度。
 * high=有代码/配置的直接证据；medium=台账或网关/Nacos 实证；
 * low=推断；doubtful=来源自注存疑或自相矛盾（**不可用于对外承诺，需复核**）。
 */
export type RelationConfidence = 'high' | 'medium' | 'low' | 'doubtful'

export const CONFIDENCE_LABELS: Record<RelationConfidence, string> = {
  high: '高',
  medium: '中',
  low: '低',
  doubtful: '存疑',
}

export const CONFIDENCE_COLORS: Record<RelationConfidence, string> = {
  high: '#16a34a',
  medium: '#2563eb',
  low: '#d97706',
  doubtful: '#dc2626',
}

/** 证据类型 */
export type EvidenceKind = 'code' | 'config' | 'gateway' | 'nacos' | 'ledger' | 'doc' | 'inference'

export const EVIDENCE_KIND_LABELS: Record<EvidenceKind, string> = {
  code: '代码',
  config: '配置',
  gateway: '网关路由',
  nacos: 'Nacos 实证',
  ledger: '台账',
  doc: '文档',
  inference: '推断',
}

/**
 * 验证结论（代码核实的产出）。
 * 关键区分：`absent`（搜了没有 → 待查）与 `refutes`（有反证 → 应删/降级）
 * **性质完全不同**，不可混为一谈。
 */
export type EvidenceVerdict = 'supports' | 'weak' | 'absent' | 'refutes'

export const VERDICT_LABELS: Record<EvidenceVerdict, string> = {
  supports: '有依据',
  weak: '弱依据',
  absent: '无证据（待查）',
  refutes: '有反证（应删/降级）',
}

export const VERDICT_COLORS: Record<EvidenceVerdict, string> = {
  supports: '#16a34a',
  weak: '#d97706',
  absent: '#94a3b8',
  refutes: '#dc2626',
}

/**
 * 待核实所需的**外部数据**。
 * 用途：把"待复核"分类成"在等什么"，避免后来人把同一批边重新排查一遍。
 * （本机已穷尽；P0 就是这张网关表）
 */
export type PendingData = 'P0-gateway' | 'external-config' | 'manual'

export const PENDING_DATA_LABELS: Record<PendingData, string> = {
  'P0-gateway': '等 API 网关路径表',
  'external-config': '等外部配置/台账（Nacos、NCC、用友、APM 等）',
  manual: '需人工确认',
}

/** 结论出处：回答「这条依赖凭什么成立」 */
export interface RelationEvidence {
  kind: EvidenceKind
  /** 可定位的出处：`pom.xml:61` / `gateway-routes.csv:189` / Data ID 等 */
  ref?: string
  note?: string
  /** 代码核实结论；由 `scripts/verify-relations.mjs` 产出 */
  verdict?: EvidenceVerdict
  /** 最近一次核实时间（ISO） */
  verifiedAt?: string
  /** 本机核实不了时，缺的是哪类外部数据（见 PendingData） */
  pendingData?: PendingData
}

export interface SystemRelation {
  id: string
  source: string
  target: string
  relationType: RelationType
  label?: string
  description?: string
  environments?: EnvType[]
  /** 依赖契约：这条边具体走的是哪个接口/topic/表（可选，用于代码级定位） */
  contract?: RelationContract
  /**
   * 语义粒度，缺省 `'node'`。
   * `'system'` 表示这是一条**系统级**事实（例如「某核心系统依赖配置中心」），
   * 为避免虚增，只挂在代表节点上，视图按 `systemId` 上提。
   */
  scope?: RelationScope
  /** 证据强度；缺省视为未评估 */
  confidence?: RelationConfidence
  /** 结论出处 */
  evidence?: RelationEvidence
}

export interface BusinessLineConfig {
  id: string
  name: string
  color: string
  description?: string
  owner?: string
  group?: string
  /** 该业务线的主责业务域（用于按域分列时的单一主域判定；缺省按内置映射兜底） */
  domain?: DomainId
}

export interface BusinessLineGroupConfig {
  id: string
  name: string
  color: string
  description?: string
  children: string[]
}

export interface BusinessFlowStep {
  nodeId: string
  label: string
}

/* ================= 业务域词表（内置默认可被数据覆盖） ================= */
/**
 * 业务域 id。
 *
 * 值域**由数据定义**（`TopologyData.domains`）：业务域是组织概念，不该写死在代码里。
 * 下面 8 个内置 id 仅作为「数据未声明 domains」时的兜底，保证老数据零迁移。
 */
export type DomainId =
  | 'fin' | 'hr' | 'oa' | 'travel' | 'law' | 'adm' | 'sec' | 'website'
  | (string & Record<never, never>)

export interface DomainDef {
  id: DomainId
  name: string
  nameEn?: string
  color: string
  description?: string
  icon?: string
}

/** 内置默认业务域（数据未声明 domains 时使用） */
export const DOMAIN_REGISTRY: DomainDef[] = [
  { id: 'fin', name: '财务管理', nameEn: 'Finance', color: '#2563eb', description: '预算、费用、发票、资金、收入', icon: '💰' },
  { id: 'hr', name: '人力资源', nameEn: 'HR', color: '#16a34a', description: '组织、入转调离、薪酬、绩效、假勤', icon: '👥' },
  { id: 'oa', name: 'OA支撑平台', nameEn: 'OA Platform', color: '#db2777', description: '流程、待办、表单、门户', icon: '🔀' },
  { id: 'travel', name: '差旅管理', nameEn: 'Travel', color: '#52c41a', description: '差旅申请、预订、报销', icon: '✈️' },
  { id: 'law', name: '法务合规', nameEn: 'Legal', color: '#7c3aed', description: '合同、用印、证照、合规', icon: '📄' },
  { id: 'adm', name: '行政与资产', nameEn: 'Administration', color: '#d97706', description: '资产、公章、采购、行政服务', icon: '🏢' },
  { id: 'sec', name: '信息安全', nameEn: 'Security', color: '#0d9488', description: '账号与安全巡检', icon: '🔒' },
  { id: 'website', name: '对外网站', nameEn: 'Website', color: '#f5222d', description: '官网、开放平台、企业站群', icon: '🌐' },
]

/** 历史域 id 别名 → 规范 id（兼容旧数据 finance/contract/platform） */
const DOMAIN_ALIASES: Record<string, DomainId> = { finance: 'fin', contract: 'law', platform: 'oa' }

export function resolveDomainId(
  id: string | undefined,
  registry: ReadonlyArray<{ id: string }> = DOMAIN_REGISTRY,
): DomainId | undefined {
  if (!id) return undefined
  const alias = DOMAIN_ALIASES[id]
  if (alias && registry.some((d) => d.id === alias)) return alias
  return registry.some((d) => d.id === id) ? (id as DomainId) : undefined
}

export function domainDef(
  id: string | undefined,
  registry: ReadonlyArray<DomainDef> = DOMAIN_REGISTRY,
): DomainDef | undefined {
  const rid = resolveDomainId(id, registry)
  return rid ? registry.find((d) => d.id === rid) : undefined
}

export const DOMAIN_LABELS: Record<string, string> = Object.fromEntries(DOMAIN_REGISTRY.map((d) => [d.id, d.name]))
export const DOMAIN_COLORS: Record<string, string> = Object.fromEntries(DOMAIN_REGISTRY.map((d) => [d.id, d.color]))
/** 业务域展示顺序（单一来源 = 注册表顺序） */
export const DOMAIN_ORDER: DomainId[] = DOMAIN_REGISTRY.map((d) => d.id)

export type BusinessFlowDomain = DomainId

export type Criticality = 'P0' | 'P1' | 'P2' | 'P3'

export interface DomainConfig {
  id: DomainId
  name: string
  color: string
  description?: string
  icon?: string
  nameEn?: string
}

export interface BusinessFlow {
  id: string
  name: string
  description: string
  /** 主责业务线（与节点 businessLine 同一值域） */
  businessLine?: BusinessLine
  domain?: BusinessFlowDomain
  owner?: string
  criticality?: Criticality
  trigger?: string
  kpi?: string
  steps: BusinessFlowStep[]
}

export const CRITICALITY_COLORS: Record<Criticality, string> = {
  P0: '#f5222d',
  P1: '#fa541c',
  P2: '#faad14',
  P3: '#8c8c8c',
}

export const TOPOLOGY_DOMAINS: DomainConfig[] = DOMAIN_REGISTRY.map((d) => ({ ...d }))

export function domainLabel(
  domain: string | undefined,
  labels: Record<string, string> = DOMAIN_LABELS,
): string {
  return (domain && labels[domain]) || '未分类'
}

export function domainColor(
  domain: string | undefined,
  colors: Record<string, string> = DOMAIN_COLORS,
): string {
  return (domain && colors[domain]) || '#8c8c8c'
}

export interface TopologyData {
  nodes: SystemNode[]
  relations: SystemRelation[]
  /** 系统注册表；节点用 systemId 指向它。未填时可由 systemId 去重派生 */
  systems?: SystemConfig[]
  /** 入口层：域名 → 路径 → 后端应用（来自网关转发规则） */
  entryRoutes?: EntryRoute[]
  businessLines?: BusinessLineConfig[]
  businessLineGroups?: BusinessLineGroupConfig[]
  businessFlows?: BusinessFlow[]
  layers?: LayerConfig[]
  domains?: DomainConfig[]
  processCatalog?: ProcessCatalog
  /** 流程宿主引擎词表（数据自定义；缺省回退内置默认，见 buildProcessHostMaps） */
  processHosts?: ProcessHostConfig[]
}

/* ================= 派生视图模型（不落盘，由 layer / 关系反推） ================= */
/* 原则：可派生的一律不写入 topology.json，统一在此计算，避免字段漂移与版本 diff 噪声。 */

/** 节点粒度（派生，不落盘） */
export type NodeScope = 'system' | 'service' | 'component'

export const SCOPE_LABELS: Record<NodeScope, string> = {
  system: '系统',
  service: '服务',
  component: '组件',
}

export const SCOPE_COLORS: Record<NodeScope, string> = {
  system: '#722ed1',
  service: '#1677ff',
  component: '#8c8c8c',
}

/** 旧 category → layer 兜底映射（category 已从 UI 退役，仅作兼容读取） */
export function categoryToLayer(c: SystemCategory | SystemLayer | undefined): SystemLayer | undefined {
  return c as SystemLayer | undefined
}

/** 读取节点层级：优先 layer（SSOT），缺失时按 category 兜底 */
export function nodeLayer(n: Pick<SystemNode, 'layer' | 'category'>): SystemLayer | undefined {
  return n.layer ?? categoryToLayer(n.category)
}

/** 粒度：由 layer + appType 派生 */
export function deriveScope(layer: SystemLayer | undefined, appType: AppType | undefined): NodeScope {
  if (layer === 'platform' || layer === 'external') return 'system'
  if (layer === 'middleware') return 'component'
  if (layer === 'infrastructure') return appType ? 'service' : 'component'
  return 'service'
}

/* ================= 系统 ↔ 节点（1—N）派生视图 ================= */
/* 原则同上：归属关系落 `systemId`，其余一律派生，不落盘。 */

/** 某系统包含的全部节点（按 id 稳定排序） */
export function nodesOfSystem(nodes: SystemNode[], systemId: string | undefined): SystemNode[] {
  if (!systemId) return []
  return nodes.filter((n) => n.systemId === systemId).sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * 系统在节点层的「代表节点」：显式 `systemPrimary` 优先，
 * 否则取第一个应用层非前端节点，再退化为首个节点。
 * 用于把系统级关系（`scope: 'system'`）落到具体节点但仍能上提。
 */
export function primaryNodeOfSystem(
  nodes: SystemNode[],
  systemId: string | undefined,
): SystemNode | undefined {
  const members = nodesOfSystem(nodes, systemId)
  if (!members.length) return undefined
  return (
    members.find((n) => n.systemPrimary) ??
    members.find((n) => nodeLayer(n) === 'application' && n.appType !== 'frontend') ??
    members.find((n) => nodeLayer(n) === 'application') ??
    members[0]
  )
}

/** 节点所属系统的元数据（`systems[]` 未注册时返回 undefined） */
export function systemOfNode(
  data: Pick<TopologyData, 'nodes' | 'systems'>,
  nodeId: string,
): SystemConfig | undefined {
  const n = data.nodes.find((x) => x.id === nodeId)
  if (!n?.systemId) return undefined
  return (data.systems || []).find((s) => s.id === n.systemId)
}

/** 节点所属业务域（派生集合）：由其参与的业务流与流程反推 */
export function nodeDomains(
  nodeId: string,
  data: Pick<TopologyData, 'businessFlows' | 'processCatalog' | 'domains'>,
): DomainId[] {
  const registry = data.domains?.length ? data.domains : DOMAIN_REGISTRY
  const ids = new Set<DomainId>()
  ;(data.businessFlows || []).forEach((f) => {
    const d = resolveDomainId(f.domain, registry)
    if (d && f.steps.some((s) => s.nodeId === nodeId)) ids.add(d)
  })
  const pc = data.processCatalog
  if (pc) {
    pc.domains.forEach((dom) => {
      const d = resolveDomainId(dom.id, registry)
      if (!d) return
      dom.groups.forEach((g) =>
        g.processes.forEach((p) => {
          if (p.systems?.includes(nodeId)) ids.add(d)
        }),
      )
    })
  }
  return Array.from(ids)
}

/** 内置「业务线 → 业务域」兜底映射；数据可用 businessLines[].domain 覆盖 */
const BUSINESS_LINE_DOMAIN: Record<string, DomainId> = {
  'oa-platform': 'oa',
  transition: 'oa',
  'form-center': 'oa',
  'cost-control': 'fin',
  travel: 'travel',
  hr: 'hr',
  contract: 'law',
  'official-biz': 'website',
}

/** 业务线 → 业务域：数据声明优先，缺省回退内置映射 */
export function businessLineDomainMap(data?: { businessLines?: BusinessLineConfig[] }): Record<string, DomainId> {
  const map: Record<string, DomainId> = { ...BUSINESS_LINE_DOMAIN }
  data?.businessLines?.forEach((bl) => {
    if (bl.domain) map[bl.id] = bl.domain
  })
  return map
}

/** 单一主域：优先 businessLine 映射，否则取派生域首个（用于架构图按域分列） */
export function nodePrimaryDomain(
  n: Pick<SystemNode, 'id' | 'businessLine'>,
  data: Pick<TopologyData, 'businessFlows' | 'processCatalog' | 'domains' | 'businessLines'>,
): DomainId | undefined {
  const map = businessLineDomainMap(data)
  if (n.businessLine && map[n.businessLine]) return map[n.businessLine]
  return nodeDomains(n.id, data)[0]
}

export interface VersionMeta {
  id: string
  name: string
  description?: string
  createdAt: string
  nodeCount: number
  relationCount: number
  size: number
}

export interface VersionIndex {
  versions: VersionMeta[]
}

export interface VersionDiff {
  addedNodes: { id: string; name: string }[]
  removedNodes: { id: string; name: string }[]
  modifiedNodes: { id: string; name: string; changes: string[] }[]
  addedRelations: { id: string; label?: string; source: string; target: string }[]
  removedRelations: { id: string; label?: string; source: string; target: string }[]
  modifiedRelations: { id: string; changes: string[] }[]
  summary: string
}

/* ===================== 业务流程目录 (Process Catalog) ===================== */
/* 业务层：板块(domain) → 流程组(group) → 流程(process)，流程间有依赖。
   systems 字段把流程关联到技术架构层的系统节点 id —— 业务流程与系统拓扑打通的桥梁。 */

export interface ProcessInfo {
  id: string
  name: string
  nameEn?: string
  desc?: string
  /** 关联的系统节点 id（对应 topology.json nodes[].id） */
  systems?: string[]
  /** 实现该流程的端到端业务流 id（对应 businessFlows[].id） */
  flows?: string[]
  /** 流程宿主引擎 id：值域由 `TopologyData.processHosts` 定义 */
  host?: ProcessHost
}

/**
 * 流程宿主引擎 id。
 *
 * 值域**由数据定义**（`TopologyData.processHosts`）：不同组织的流程引擎不同，
 * 把某家公司的产品名写死在代码里，开源或私有化部署时就必然要改代码。
 * 下面三个默认 id 只作为「数据未声明 processHosts」时的兜底示例。
 */
export type ProcessHost = 'engine-a' | 'engine-b' | 'hybrid' | (string & Record<never, never>)

export interface ProcessHostConfig {
  id: string
  name: string
  color: string
  description?: string
}

/** 兜底词表：数据未声明 processHosts 时使用 */
export const DEFAULT_PROCESS_HOSTS: ProcessHostConfig[] = [
  { id: 'engine-a', name: '流程引擎 A', color: '#f5222d' },
  { id: 'engine-b', name: '流程引擎 B', color: '#1677ff' },
  { id: 'hybrid', name: '混合引擎', color: '#722ed1' },
]

/** @deprecated 用 buildProcessHostMaps(data) 取词表；保留仅为兼容既有引用 */
export const HOST_LABELS: Record<string, string> = Object.fromEntries(
  DEFAULT_PROCESS_HOSTS.map((h) => [h.id, h.name]),
)

/** @deprecated 用 buildProcessHostMaps(data) 取词表；保留仅为兼容既有引用 */
export const HOST_COLORS: Record<string, string> = Object.fromEntries(
  DEFAULT_PROCESS_HOSTS.map((h) => [h.id, h.color]),
)

/** 宿主引擎词表派生：优先数据声明，缺失回退内置默认 */
export function buildProcessHostMaps(data?: { processHosts?: ProcessHostConfig[] }) {
  const hosts = data?.processHosts?.length ? data.processHosts : DEFAULT_PROCESS_HOSTS
  const labels: Record<string, string> = {}
  const colors: Record<string, string> = {}
  hosts.forEach((h) => {
    labels[h.id] = h.name
    colors[h.id] = h.color
  })
  return { hosts, labels, colors }
}

export interface ProcessGroup {
  id: string
  name: string
  nameEn?: string
  processes: ProcessInfo[]
}

export interface ProcessDomain {
  id: string
  name: string
  nameEn?: string
  groups: ProcessGroup[]
}

export interface ProcessDependency {
  from: string
  to: string
  type?: string
  note?: string
}

export interface ProcessCatalog {
  domains: ProcessDomain[]
  dependencies: ProcessDependency[]
}

export const PROCESS_DOMAIN_COLORS: Record<string, string> = DOMAIN_COLORS

export function processDomainColor(id: string, colors: Record<string, string> = DOMAIN_COLORS): string {
  return (id && colors[id]) || '#6b7280'
}

export const ENV_LABELS: Record<EnvType, string> = {
  dev: '开发',
  test: '测试',
  staging: '预发',
  production: '生产',
}

export const ENV_COLORS: Record<EnvType, string> = {
  dev: '#8c8c8c',
  test: '#faad14',
  staging: '#722ed1',
  production: '#52c41a',
}

export const STATUS_LABELS: Record<EnvStatus, string> = {
  running: '运行中',
  stopped: '已停止',
  degraded: '降级',
  unknown: '未知',
}

export const STATUS_COLORS: Record<EnvStatus, string> = {
  running: '#52c41a',
  stopped: '#ff4d4f',
  degraded: '#faad14',
  unknown: '#d9d9d9',
}

/** @deprecated 见 SystemCategory，UI 请使用 LAYER_LABELS */
export const CATEGORY_LABELS: Record<SystemCategory, string> = {
  platform: '平台',
  middleware: '中间件',
  application: '应用服务',
  infrastructure: '基础设施',
  external: '外部系统',
}

/** @deprecated 见 SystemCategory，UI 请使用 LAYER_COLORS */
export const CATEGORY_COLORS: Record<SystemCategory, string> = {
  platform: '#1677ff',
  middleware: '#722ed1',
  application: '#13c2c2',
  infrastructure: '#fa8c16',
  external: '#eb2f96',
}

export const LAYER_LABELS: Record<SystemLayer, string> = {
  access: '接入层',
  application: '应用服务层',
  platform: '平台层',
  middleware: '中间件层',
  infrastructure: '基础设施层',
  external: '外部系统层',
}

export const LAYER_COLORS: Record<SystemLayer, string> = {
  access: '#13c2c2',
  application: '#1677ff',
  platform: '#722ed1',
  middleware: '#fa8c16',
  infrastructure: '#8c8c8c',
  external: '#eb2f96',
}

export const LAYER_ORDER: SystemLayer[] = [
  'external', 'access', 'application', 'platform', 'middleware', 'infrastructure',
]

export function layerLabel(layer: SystemLayer | undefined): string {
  return (layer && LAYER_LABELS[layer]) || '未分层'
}

export const APP_TYPE_LABELS: Record<AppType, string> = {
  frontend: '前端',
  backend: '后端',
  bff: 'BFF',
  fullstack: '全栈',
}

export const APP_TYPE_COLORS: Record<AppType, string> = {
  frontend: '#13c2c2',
  backend: '#1677ff',
  bff: '#722ed1',
  fullstack: '#52c41a',
}

export const RELATION_LABELS: Record<RelationType, string> = {
  depends_on: '依赖',
  calls: '调用',
  publishes_to: '发布消息到',
  subscribes_from: '订阅消息自',
  syncs_with: '数据同步',
  deploys_to: '部署到',
}

export const BUSINESS_LINE_LABELS: Record<BusinessLine, string> = {
  'oa-platform': '协同办公',
  'transition': '流程中转',
  'cost-control': '费用控制',
  'travel': '差旅',
  'hr': '人事',
  'infra': '基础设施',
  'form-center': '表单中心',
  'contract': '合同',
  'official-biz': '行政采购',
  'external': '外部系统',
}

export const BUSINESS_LINE_COLORS: Record<BusinessLine, string> = {
  'oa-platform': '#1677ff',
  'transition': '#13c2c2',
  'cost-control': '#faad14',
  'travel': '#52c41a',
  'hr': '#2f54eb',
  'infra': '#fa8c16',
  'form-center': '#722ed1',
  'contract': '#eb2f96',
  'official-biz': '#f5222d',
  'external': '#8c8c8c',
}

export interface BusinessLineGroup {
  id: string
  label: string
  color: string
  children: BusinessLine[]
}

export const BUSINESS_LINE_GROUPS: BusinessLineGroup[] = [
  { id: 'oa-group', label: '协同线', color: '#1677ff', children: ['oa-platform', 'hr'] },
  { id: 'eff-group', label: '业务线', color: '#13c2c2', children: ['transition', 'cost-control', 'travel', 'form-center', 'contract'] },
]

export const STANDALONE_BUSINESS_LINES: BusinessLine[] = ['infra', 'official-biz', 'external']

export function buildBusinessLineMaps(data?: { businessLines?: BusinessLineConfig[]; businessLineGroups?: BusinessLineGroupConfig[] }) {
  const labels: Record<string, string> = { ...BUSINESS_LINE_LABELS }
  const colors: Record<string, string> = { ...BUSINESS_LINE_COLORS }
  const groups: BusinessLineGroup[] = []
  const standalones: string[] = []

  if (data?.businessLines?.length) {
    data.businessLines.forEach((bl) => {
      labels[bl.id] = bl.name
      colors[bl.id] = bl.color
    })
  }

  if (data?.businessLineGroups?.length) {
    data.businessLineGroups.forEach((g) => {
      groups.push({ id: g.id, label: g.name, color: g.color, children: g.children as BusinessLine[] })
    })
    const grouped = new Set(data.businessLineGroups.flatMap((g) => g.children))
    ;(data.businessLines || []).forEach((bl) => {
      if (!grouped.has(bl.id)) standalones.push(bl.id)
    })
  } else {
    groups.push(...BUSINESS_LINE_GROUPS)
    standalones.push(...STANDALONE_BUSINESS_LINES)
  }

  return { labels, colors, groups, standalones }
}

/* 业务域配置：优先使用 topology.json 的 domains[].name/color/description/icon，
   缺失时回退到内置常量。 */
export function buildDomainMaps(data?: { domains?: DomainConfig[] }) {
  // 数据声明了 domains 就是权威词表（不再与内置默认混合，避免出现「数据里没有的域」）
  const domains: DomainDef[] = data?.domains?.length
    ? data.domains.map((d) => ({
        id: d.id,
        name: d.name,
        color: d.color,
        description: d.description,
        icon: d.icon,
        nameEn: d.nameEn,
      }))
    : DOMAIN_REGISTRY

  const labels: Record<string, string> = {}
  const colors: Record<string, string> = {}
  const descriptions: Record<string, string> = {}
  const icons: Record<string, string> = {}
  domains.forEach((d) => {
    labels[d.id] = d.name
    colors[d.id] = d.color
    descriptions[d.id] = d.description || ''
    icons[d.id] = d.icon || ''
  })

  return { domains, labels, colors, descriptions, icons, order: domains.map((d) => d.id) }
}
