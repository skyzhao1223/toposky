#!/usr/bin/env node
/**
 * CI 用元数据漂移检测（独立实现，避免依赖 Next/TS 别名）。
 * 与 src/lib/validateTopology.ts 保持同一套口径；如两者不一致，以本文件为准补齐。
 * 用法：node scripts/validate-topology.mjs   或   npm run validate
 * 有 error → 退出码 1（可接入流水线阻断）；warning 仅提示。
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { dataFile, dataDisplay, dataIsDemo } from './lib/data-file.mjs'

// 证据口径只此一处（Node 原生可直接 import .ts），避免校验器与报告各算一套
const { evidenceSummary } = await import(
  pathToFileURL(path.join(process.cwd(), 'src/lib/evidence.ts')).href
)
const { PENDING_DATA_LABELS, buildProcessHostMaps, DOMAIN_REGISTRY, resolveDomainId } = await import(
  pathToFileURL(path.join(process.cwd(), 'src/types/index.ts')).href
)

const DATA = dataFile()

const LAYERS = ['access', 'application', 'platform', 'middleware', 'infrastructure', 'external']
const RELATION_TYPES = ['depends_on', 'calls', 'publishes_to', 'subscribes_from', 'syncs_with', 'deploys_to']
const CONTRACT_KINDS = ['http', 'rpc', 'mq', 'db', 'file', 'other']
const RELATION_SCOPES = ['node', 'system']
const CONFIDENCES = ['high', 'medium', 'low', 'doubtful']
const EVIDENCE_KINDS = ['code', 'config', 'gateway', 'nacos', 'ledger', 'doc', 'inference']
const EVIDENCE_VERDICTS = ['supports', 'weak', 'absent', 'refutes']
// 入口环境由采集源定义（prod / test / 自定义皆可），这里不做固定枚举

const errors = []
const warnings = []
const err = (m) => errors.push(m)
const warn = (m) => warnings.push(m)

let data
try {
  data = JSON.parse(fs.readFileSync(DATA, 'utf-8'))
} catch (e) {
  console.error(`无法读取/解析 ${dataDisplay()}: ${e.message}`)
  process.exit(1)
}

if (!Array.isArray(data.nodes)) {
  console.error('数据格式错误：缺少 nodes 数组')
  process.exit(1)
}

const blIds = new Set((data.businessLines || []).map((b) => b.id))
const hostMaps = buildProcessHostMaps(data)

// 业务域词表：数据声明即权威（未声明时回退内置默认）
const domainRegistry = data.domains?.length ? data.domains : DOMAIN_REGISTRY
const resolveDomain = (id) => resolveDomainId(id, domainRegistry)
const domainIds = new Set()
;(data.domains || []).forEach((dm, i) => {
  if (!dm.id) err(`domains[${i}] 缺少 id`)
  else if (domainIds.has(dm.id)) err(`业务域 id 重复：${dm.id}`)
  else domainIds.add(dm.id)
  if (!dm.name) warn(`业务域 ${dm.id || `[${i}]`} 缺少名称`)
  if (!dm.color) warn(`业务域 ${dm.id || `[${i}]`} 缺少颜色`)
})
;(data.businessLines || []).forEach((bl) => {
  if (bl.domain && !resolveDomain(bl.domain)) err(`业务线 ${bl.id} 的 domain 不在业务域词表：${bl.domain}`)
})
const nodeIds = new Set()
const repoPathSeen = new Map()

// —— 系统注册表（一个系统包含 1—N 个节点） ——
const systems = data.systems || []
const systemIds = new Set()
systems.forEach((s, i) => {
  if (!s.id) return err(`systems[${i}] 缺少 id`)
  if (systemIds.has(s.id)) err(`系统 id 重复：${s.id}`)
  systemIds.add(s.id)
  if (!s.name || !s.name.trim()) err(`系统 ${s.id} 缺少名称`)
  if (s.businessLine && blIds.size && !blIds.has(s.businessLine)) err(`系统 ${s.id} 的 businessLine 不在注册表：${s.businessLine}`)
})

// —— 节点 ——
data.nodes.forEach((n, i) => {
  if (!n.id) return err(`nodes[${i}] 缺少 id`)
  if (nodeIds.has(n.id)) err(`系统节点 id 重复：${n.id}`)
  nodeIds.add(n.id)
  if (!n.name || !n.name.trim()) err(`节点 ${n.id} 缺少名称`)

  const layer = n.layer || n.category
  if (!layer) warn(`节点 ${n.id} 缺少架构分层 layer`)
  else if (!LAYERS.includes(layer)) err(`节点 ${n.id} 的 layer 非法：${layer}`)

  if (n.businessLine && blIds.size && !blIds.has(n.businessLine)) err(`节点 ${n.id} 的 businessLine 不在注册表：${n.businessLine}`)

  if (layer === 'external') {
    if (n.owner) warn(`外部系统 ${n.id} 的 owner 填了「${n.owner}」，请改用 vendor / contacts`)
    if (!n.vendor) warn(`外部系统 ${n.id} 缺少供应商 vendor`)
    if (!n.contacts || n.contacts.length === 0) warn(`外部系统 ${n.id} 缺少联系人 contacts`)
  }
  ;(n.contacts || []).forEach((c, ci) => {
    if (!c.name || !c.name.trim()) err(`节点 ${n.id} 的联系人[${ci}] 缺少姓名`)
  })

  if (n.systemId && systemIds.size && !systemIds.has(n.systemId)) {
    err(`节点 ${n.id} 的 systemId 不在 systems 注册表：${n.systemId}`)
  }
  if (n.systemPrimary && !n.systemId) err(`节点 ${n.id} 标了 systemPrimary 但没有 systemId`)
  if (n.repoPath) {
    const key = (n.links && n.links.repo ? n.links.repo : '') + '#' + n.repoPath
    if (repoPathSeen.has(key)) warn(`节点 ${n.id} 的 repoPath 与 ${repoPathSeen.get(key)} 重复：${n.repoPath}`)
    else repoPathSeen.set(key, n.id)
  }

  // 仓库链接必须是 http(s) URL（不针对某家公司的域名做特判）
  const repo = (n.links || {}).repo
  if (repo && !/^https?:\/\//.test(repo)) {
    warn(`节点 ${n.id} 的 repo 链接不是 http(s) URL：${repo}`)
  }
})

// 每个系统至多一个代表节点
const primaryNodes = data.nodes.filter((n) => n.systemPrimary)
const primBySystem = new Map()
primaryNodes.forEach((n) => {
  if (primBySystem.has(n.systemId)) err(`系统 ${n.systemId} 有多个代表节点：${primBySystem.get(n.systemId)}、${n.id}`)
  else primBySystem.set(n.systemId, n.id)
})

// —— 关系 ——
const nodeById = new Map(data.nodes.map((n) => [n.id, n]))
const layerOfNode = (id) => { const n = nodeById.get(id); return n ? (n.layer || n.category) : undefined }
const relIds = new Set()
const triples = new Set()
;(data.relations || []).forEach((r, i) => {
  if (!r.id) err(`relations[${i}] 缺少 id`)
  else if (relIds.has(r.id)) err(`关系 id 重复：${r.id}`)
  else relIds.add(r.id)
  if (!RELATION_TYPES.includes(r.relationType)) err(`关系 ${r.id} relationType 非法：${r.relationType}`)
  if (r.contract?.kind && !CONTRACT_KINDS.includes(r.contract.kind)) err(`关系 ${r.id} contract.kind 非法：${r.contract.kind}`)
  if (r.scope && !RELATION_SCOPES.includes(r.scope)) err(`关系 ${r.id} scope 非法：${r.scope}`)
  if (r.confidence && !CONFIDENCES.includes(r.confidence)) err(`关系 ${r.id} confidence 非法：${r.confidence}`)
  if (r.evidence?.kind && !EVIDENCE_KINDS.includes(r.evidence.kind)) err(`关系 ${r.id} evidence.kind 非法：${r.evidence.kind}`)
  if (r.evidence?.verdict && !EVIDENCE_VERDICTS.includes(r.evidence.verdict)) err(`关系 ${r.id} evidence.verdict 非法：${r.evidence.verdict}`)
  // 一致性：有反证的边必须 doubtful；反之 doubtful 的边应当已标注 verdict
  if (r.evidence?.verdict === 'refutes' && r.confidence !== 'doubtful') {
    warn(`关系 ${r.id} 标了 evidence.verdict=refutes（有反证）但 confidence=${r.confidence}：应降为 doubtful`)
  }
  if (r.confidence === 'doubtful' && !r.evidence?.verdict) {
    warn(`关系 ${r.id} 为 doubtful 但未标注 evidence.verdict：请区分「无证据(absent)」还是「有反证(refutes)」`)
  }
  if (r.source === r.target) err(`关系 ${r.id} 为自环：${r.source}`)
  if (!nodeIds.has(r.source)) err(`关系 ${r.id} source 悬空：${r.source}`)
  if (!nodeIds.has(r.target)) err(`关系 ${r.id} target 悬空：${r.target}`)
  const t = `${r.source}|${r.target}|${r.relationType}`
  if (triples.has(t)) warn(`重复关系（来源/目标/类型相同）：${t}`)
  else triples.add(t)

  // 架构异味：纯前端直连中间件（BFF 属服务端组件，可自有存储，不告警）
  // 例外：scope='system' 的边是系统级事实，source 只是系统锚点，不是真实的前端调用
  const sNode = nodeById.get(r.source)
  if (r.scope !== 'system' && layerOfNode(r.source) === 'access' && layerOfNode(r.target) === 'middleware' && sNode?.appType !== 'bff') {
    warn(`前端 ${r.source} 直连中间件 ${r.target}（${r.label || r.relationType}）：确认是否应经应用服务 / BFF`)
  }
  // 约定：depends_on 用于依赖中间件/基础设施；服务间运行时调用应使用 calls
  if (r.relationType === 'depends_on' && layerOfNode(r.target) === 'application') {
    warn(`关系 ${r.id}（${r.source} → ${r.target}）用 depends_on 指向应用层，按约定服务间调用应使用 calls`)
  }
})

const rels = data.relations || []
// 区分「有 contract.kind（可能由语义推导）」与「真正定位到接口/topic/表（contract.target）」
const noContract = rels.filter((r) => !r.contract || !r.contract.kind).length
if (rels.length && noContract) {
  warn(`${noContract}/${rels.length} 条关系未填写依赖契约 contract（接口/topic/表），代码级定位精度受限`)
}
const noContractTarget = rels.filter((r) => !r.contract || !r.contract.target).length
if (rels.length && noContractTarget && !noContract) {
  // 拆开说：哪些还能补、哪些本来就没有接口契约 —— 否则「N 条只有 kind」读起来像全都可补
  const fam = { 内部服务: 0, Nacos: 0, 关系型库: 0, 消息中间件: 0, 其他: 0 }
  const nameOfNode = (id) => ((data.nodes.find((n) => n.id === id) || {}).name || '') + ' ' + id
  rels.filter((r) => r.contract && r.contract.kind && !r.contract.target).forEach((r) => {
    const key = nameOfNode(r.target)
    if (/nacos/i.test(key)) fam.Nacos += 1
    else if (/mysql|sqlserver|dameng|oracle|postgres|tidb/i.test(key)) fam.关系型库 += 1
    else if (/kafka|rocketmq|rabbit|redis|elasticsearch/i.test(key)) fam.消息中间件 += 1
    else if (/ks3|对象存储|官网|NCC|汇联易|携程|滴滴|同程|高德|Moka|秀合同|阿里云/i.test(key)) fam.其他 += 1
    else fam.内部服务 += 1
  })
  const famDetail = Object.entries(fam).filter(([, v]) => v > 0).map(([k, v]) => k + ' ' + v).join(' · ')
  const located = rels.filter((r) => r.contract && r.contract.target).length
  warn(
    `契约定位：${located}/${rels.length} 已定位到具体落点；其余 ${noContractTarget} 条只有 contract.kind（${famDetail}）` +
      `。内部服务需 API 网关路径表；注册中心类依赖本无接口契约`,
  )
}

// 证据出处覆盖率：回答「这条依赖凭什么成立」
const noEvidence = rels.filter((r) => !r.evidence || !r.evidence.kind).length
if (rels.length && noEvidence) {
  warn(`${noEvidence}/${rels.length} 条关系未填写 evidence 出处（代码/配置/网关/Nacos/台账/文档），结论无法溯源`)
}
// 需人工复核的关系：doubtful（来源存疑）/ absent（按该来源没搜到）/ refutes（有反证）
const EV = evidenceSummary(rels)
if (EV.needsReview) {
  const doubtful = rels.filter((r) => r.confidence === 'doubtful')
  const head = doubtful.slice(0, 5).map((r) => r.id).join('、')
  const pending = Object.entries(EV.byPending).map(([k, v]) => (PENDING_DATA_LABELS[k] || k) + ' ' + v).join(' · ')
  warn(
    `${EV.needsReview} 条关系需人工复核（refutes ${EV.byVerdict.refutes} / absent ${EV.byVerdict.absent} / doubtful ${doubtful.length}）：` +
      `不可用于对外承诺；在等什么：${pending}；doubtful：${head}${doubtful.length > 5 ? ' 等' : ''}（清单见 npm run report:quality）`,
  )
}

// 系统级关系（scope='system'）须挂在系统代表节点上，否则视图无法上提
const primaryIdSet = new Set(primaryNodes.map((n) => n.id))
rels.forEach((r) => {
  if (r.scope === 'system' && !primaryIdSet.has(r.source) && !primaryIdSet.has(r.target)) {
    warn(`关系 ${r.id} 标为系统级 scope，但两端都不是系统代表节点（${r.source} → ${r.target}）：请改挂代表节点或降级为节点级`)
  }
})
// 系统级边锚在接入层节点上：该系统在图谱里没有后端节点，锚点只是句柄
// BFF 是服务端组件，作为系统锚点是合理的，不算「缺后端节点」
const sysOnAccess = rels.filter((r) => r.scope === 'system' && layerOfNode(r.source) === 'access' && nodeById.get(r.source)?.appType !== 'bff')
if (sysOnAccess.length) {
  const sysSet = new Set(sysOnAccess.map((r) => nodeById.get(r.source)?.systemId).filter(Boolean))
  warn(
    `${sysOnAccess.length} 条系统级边锚定在接入层节点上（该系统缺后端节点，锚点仅作句柄）：${[...sysSet].slice(0, 6).join('、')}${sysSet.size > 6 ? ' 等' : ''}`,
  )
}

// —— 入口层（网关转发规则） ——
const entryRoutes = data.entryRoutes || []
if (entryRoutes.length) {
  let noHttps = 0
  entryRoutes.forEach((r, i) => {
    if (!r.domain || !r.path) err(`entryRoutes[${i}] 缺少 domain / path`)
    if (!r.env) err(`entryRoutes[${i}] 缺少 env`)
    if (r.nodeId && !nodeIds.has(r.nodeId)) err(`entryRoutes[${i}] nodeId 悬空：${r.nodeId}`)
    if (r.https === false) noHttps++
  })

  warn(`入口层：${entryRoutes.length} 条路由 / ${new Set(entryRoutes.map((r) => r.domain)).size} 个域名 / ${entryRoutes.filter((r) => r.nodeId).length} 条已映射节点；其中 ${noHttps} 条未强制 HTTPS`)
}

// —— 业务线分组 ——
;(data.businessLineGroups || []).forEach((g) => {
  ;(g.children || []).forEach((c) => {
    if (blIds.size && !blIds.has(c)) err(`业务线分组 ${g.id} 包含不存在的业务线：${c}`)
  })
})

// —— 宿主引擎词表 ——
;(data.processHosts || []).forEach((h, i) => {
  if (!h.id) err(`processHosts[${i}] 缺少 id`)
  if (!h.name) warn(`宿主引擎 ${h.id || `[${i}]`} 缺少名称`)
  if (!h.color) warn(`宿主引擎 ${h.id || `[${i}]`} 缺少颜色`)
})

// —— 业务流 ——
const flowIds = new Set()
;(data.businessFlows || []).forEach((f, i) => {
  if (!f.id) err(`businessFlows[${i}] 缺少 id`)
  else if (flowIds.has(f.id)) err(`业务流 id 重复：${f.id}`)
  else flowIds.add(f.id)
  if (f.domain && !resolveDomain(f.domain)) err(`业务流 ${f.id} domain 不在业务域词表：${f.domain}`)
  if (f.businessLine && blIds.size && !blIds.has(f.businessLine)) err(`业务流 ${f.id} businessLine 不在注册表：${f.businessLine}`)
  ;(f.steps || []).forEach((s, j) => {
    if (!nodeIds.has(s.nodeId)) err(`业务流 ${f.id} 步骤[${j}] 指向不存在节点：${s.nodeId}`)
  })
})

// —— 流程目录 ——
const pc = data.processCatalog
const procIds = new Set()
if (pc) {
  pc.domains.forEach((dom) => {
    if (!resolveDomain(dom.id)) err(`流程板块 domain 不在业务域词表：${dom.id}`)
    dom.groups.forEach((g) => {
      g.processes.forEach((p) => {
        if (procIds.has(p.id)) err(`流程 id 重复：${p.id}`)
        else procIds.add(p.id)
        if (!p.host) warn(`流程 ${p.id} 未标注宿主引擎`)
        else if (!hostMaps.labels[p.host]) err(`流程 ${p.id} 的宿主引擎不在词表：${p.host}（在 processHosts 中声明，或留空）`)
        ;(p.systems || []).forEach((sid) => { if (!nodeIds.has(sid)) err(`流程 ${p.id} 关联系统不存在：${sid}`) })
        ;(p.flows || []).forEach((fid) => { if (!flowIds.has(fid)) err(`流程 ${p.id} 关联业务流不存在：${fid}`) })
      })
    })
  })
  pc.dependencies.forEach((dep, i) => {
    if (!procIds.has(dep.from)) err(`流程依赖[${i}] from 悬空：${dep.from}`)
    if (!procIds.has(dep.to)) err(`流程依赖[${i}] to 悬空：${dep.to}`)
  })

  const referenced = new Set()
  pc.domains.forEach((d) => d.groups.forEach((g) => g.processes.forEach((p) => (p.flows || []).forEach((fid) => referenced.add(fid)))))
  ;(data.businessFlows || []).forEach((f) => { if (!referenced.has(f.id)) warn(`业务流 ${f.id}（${f.name}）未被任何流程目录项引用`) })
  const noFlow = pc.domains.flatMap((d) => d.groups.flatMap((g) => g.processes.filter((p) => !p.flows || p.flows.length === 0)))
  if (noFlow.length) warn(`${noFlow.length} 个流程未关联任何业务流（流程目录 ↔ 端到端业务流 桥接不完整）`)
}

// —— 输出 ——
console.log(`数据源：${dataDisplay()}${dataIsDemo() ? '（示例数据，非真实实例）' : ''}`)
const nodeCount = data.nodes.length
const relCount = (data.relations || []).length
const sysCount = systemIds.size || new Set(data.nodes.map((n) => n.systemId).filter(Boolean)).size
const ownedNodes = data.nodes.filter((n) => n.systemId).length
const evAll = evidenceSummary(rels)
console.log(
  `拓扑元数据校验：${nodeCount} 节点 / ${relCount} 关系 / ${(data.businessFlows || []).length} 业务流 / ${procIds.size} 流程` +
    `\n                   ${sysCount} 系统 / ${ownedNodes} 个节点已归属系统` +
    `\n                   证据：${evAll.withSource}/${relCount} 有来源标注、${evAll.verified} 已核实（${relCount ? Math.round((evAll.verified / relCount) * 100) : 0}%）` +
    ` ——「有标注」≠「已核实」；可用于对外承诺 ${evAll.committable} 条`,
)
if (warnings.length) {
  console.log(`\n⚠️  ${warnings.length} 条提醒：`)
  warnings.forEach((w) => console.log(`   - ${w}`))
}
if (errors.length) {
  console.error(`\n❌ ${errors.length} 条错误：`)
  errors.forEach((e) => console.error(`   - ${e}`))
  process.exit(1)
}
console.log('\n✅ 无致命错误')
