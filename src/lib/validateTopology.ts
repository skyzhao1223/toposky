import type { TopologyData } from '@/types'
import { evidenceSummary } from '@/lib/evidence'
import { PENDING_DATA_LABELS } from '@/types'
import {
  resolveDomainId,
  nodeLayer,
  LAYER_ORDER,
  RELATION_LABELS,
  CONTRACT_KIND_LABELS,
  STATUS_LABELS,
  RELATION_SCOPE_LABELS,
  CONFIDENCE_LABELS,
  EVIDENCE_KIND_LABELS,
  VERDICT_LABELS,
  DOMAIN_REGISTRY,
  buildBusinessLineMaps,
  buildProcessHostMaps,
} from '@/types'

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

/**
 * 校验拓扑数据的引用完整性与基本 schema。
 * 用于保存前拦截脏数据（悬空节点/流程/域 id 等）。
 */
export function validateTopology(data: TopologyData): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!data || !Array.isArray(data.nodes)) {
    return { ok: false, errors: ['数据格式错误：缺少 nodes 数组'], warnings }
  }

  const blIds = new Set(Object.keys(buildBusinessLineMaps(data).labels))
  const validStatuses = new Set(Object.keys(STATUS_LABELS))

  // 系统注册表：节点用 systemId 指向它（一个系统包含 1—N 个节点）
  const systemIds = new Set<string>()
  ;(data.systems || []).forEach((s, i) => {
    if (!s.id) errors.push(`systems[${i}] 缺少 id`)
    else if (systemIds.has(s.id)) errors.push(`系统 id 重复：${s.id}`)
    else systemIds.add(s.id)
    if (!s.name || !s.name.trim()) errors.push(`systems[${i}]（${s.id || '无 id'}）缺少名称`)
    if (s.businessLine && !blIds.has(s.businessLine)) {
      errors.push(`系统 ${s.id} 的 businessLine 不在业务线注册表：${s.businessLine}`)
    }
  })

  const nodeIds = new Set<string>()
  const repoPathSeen = new Map<string, string>()
  data.nodes.forEach((n, i) => {
    if (!n.id) errors.push(`nodes[${i}] 缺少 id`)
    else if (nodeIds.has(n.id)) errors.push(`系统节点 id 重复：${n.id}`)
    else nodeIds.add(n.id)

    if (!n.name || !n.name.trim()) errors.push(`nodes[${i}]（${n.id || '无 id'}）缺少名称`)

    // 架构分层为唯一结构轴（SSOT），缺失仅告警；非法值报错
    const layer = nodeLayer(n)
    if (!layer) warnings.push(`节点 ${n.id} 缺少架构分层 layer`)
    else if (!LAYER_ORDER.includes(layer)) errors.push(`节点 ${n.id} 的 layer 非法：${layer}`)

    if (n.businessLine && !blIds.has(n.businessLine)) {
      errors.push(`节点 ${n.id} 的 businessLine 不在业务线注册表：${n.businessLine}`)
    }

    // 外部系统：owner 仅限内部团队；供应商与联系方式用 vendor / contacts
    if (layer === 'external') {
      if (n.owner) warnings.push(`外部系统 ${n.id} 的 owner 填了「${n.owner}」，请改用 vendor（供应商）与 contacts（联系人）`)
      if (!n.vendor) warnings.push(`外部系统 ${n.id} 缺少供应商 vendor`)
      if (!n.contacts || n.contacts.length === 0) warnings.push(`外部系统 ${n.id} 缺少联系人 contacts`)
    }
    ;(n.contacts || []).forEach((c, ci) => {
      if (!c.name || !c.name.trim()) errors.push(`节点 ${n.id} 的联系人[${ci}] 缺少姓名`)
    })

    if (n.systemId && systemIds.size && !systemIds.has(n.systemId)) {
      errors.push(`节点 ${n.id} 的 systemId 不在 systems 注册表：${n.systemId}`)
    }
    if (n.systemPrimary && !n.systemId) {
      errors.push(`节点 ${n.id} 标了 systemPrimary 但没有 systemId`)
    }
    if (n.repoPath) {
      const key = (n.links?.repo || '') + '#' + n.repoPath
      const dup = repoPathSeen.get(key)
      if (dup) warnings.push(`节点 ${n.id} 的 repoPath 与 ${dup} 重复：${n.repoPath}`)
      else repoPathSeen.set(key, n.id)
    }

    // 仓库链接必须是 http(s) URL（不针对某家公司的域名做特判）
    const repo = n.links?.repo
    if (repo && !/^https?:\/\//.test(repo)) {
      warnings.push(`节点 ${n.id} 的 repo 链接不是 http(s) URL：${repo}`)
    }

    Object.entries(n.environments || {}).forEach(([env, info]) => {
      if (info?.status && !validStatuses.has(info.status)) {
        errors.push(`节点 ${n.id} 的 ${env} 环境 status 非法：${info.status}`)
      }
    })
  })

  // 每个系统至多一个代表节点（系统级关系挂靠点）
  const primaryNodes = data.nodes.filter((n) => n.systemPrimary)
  const primBySystem = new Map<string, string>()
  primaryNodes.forEach((n) => {
    if (n.systemId && primBySystem.has(n.systemId)) {
      errors.push(`系统 ${n.systemId} 有多个代表节点：${primBySystem.get(n.systemId)}、${n.id}`)
    } else if (n.systemId) {
      primBySystem.set(n.systemId, n.id)
    }
  })

  // 关系：id 唯一性、类型合法、自环、引用、重复
  const nodeById = new Map(data.nodes.map((n) => [n.id, n]))
  const validRelationTypes = new Set(Object.keys(RELATION_LABELS))
  const validContractKinds = new Set(Object.keys(CONTRACT_KIND_LABELS))
  const validScopes = new Set(Object.keys(RELATION_SCOPE_LABELS))
  const validConfidences = new Set(Object.keys(CONFIDENCE_LABELS))
  const validEvidenceKinds = new Set(Object.keys(EVIDENCE_KIND_LABELS))
  const validVerdicts = new Set(Object.keys(VERDICT_LABELS))
  const relationIds = new Set<string>()
  const relationTriples = new Set<string>()
  ;(data.relations || []).forEach((r, i) => {
    if (!r.id) errors.push(`relations[${i}] 缺少 id`)
    else if (relationIds.has(r.id)) errors.push(`关系 id 重复：${r.id}`)
    else relationIds.add(r.id)

    if (r.relationType && !validRelationTypes.has(r.relationType)) {
      errors.push(`relations[${i}]（${r.id}）relationType 非法：${r.relationType}`)
    }
    if (r.contract?.kind && !validContractKinds.has(r.contract.kind)) {
      errors.push(`关系 ${r.id} 的 contract.kind 非法：${r.contract.kind}`)
    }
    if (r.scope && !validScopes.has(r.scope)) {
      errors.push(`关系 ${r.id} 的 scope 非法：${r.scope}`)
    }
    if (r.confidence && !validConfidences.has(r.confidence)) {
      errors.push(`关系 ${r.id} 的 confidence 非法：${r.confidence}`)
    }
    if (r.evidence?.kind && !validEvidenceKinds.has(r.evidence.kind)) {
      errors.push(`关系 ${r.id} 的 evidence.kind 非法：${r.evidence.kind}`)
    }
    if (r.evidence?.verdict && !validVerdicts.has(r.evidence.verdict)) {
      errors.push(`关系 ${r.id} 的 evidence.verdict 非法：${r.evidence.verdict}`)
    }
    // 一致性：有反证的边必须 doubtful；反之 doubtful 应标注 verdict（无证据 vs 有反证）
    if (r.evidence?.verdict === 'refutes' && r.confidence !== 'doubtful') {
      warnings.push(`关系 ${r.id} 标了 evidence.verdict=refutes（有反证）但 confidence=${r.confidence}：应降为 doubtful`)
    }
    if (r.confidence === 'doubtful' && !r.evidence?.verdict) {
      warnings.push(`关系 ${r.id} 为 doubtful 但未标注 evidence.verdict：请区分「无证据(absent)」还是「有反证(refutes)」`)
    }
    if (r.source && r.source === r.target) {
      errors.push(`relations[${i}]（${r.id}）为自环关系：${r.source}`)
    }
    if (!nodeIds.has(r.source)) errors.push(`relations[${i}] source 指向不存在的节点：${r.source}`)
    if (!nodeIds.has(r.target)) errors.push(`relations[${i}] target 指向不存在的节点：${r.target}`)

    const triple = `${r.source}|${r.target}|${r.relationType}`
    if (relationTriples.has(triple)) warnings.push(`存在重复关系（来源/目标/类型相同）：${triple}`)
    else relationTriples.add(triple)

    // 架构异味：纯前端直连中间件（BFF 属服务端组件，可自有存储，不告警）
    const sNode = nodeById.get(r.source)
    const sLayer = sNode ? nodeLayer(sNode) : undefined
    const tNode = nodeById.get(r.target)
    const tLayer = tNode ? nodeLayer(tNode) : undefined
    // 例外：scope='system' 的边是系统级事实，source 只是系统锚点，不是真实的前端调用
    if (r.scope !== 'system' && sLayer === 'access' && tLayer === 'middleware' && sNode?.appType !== 'bff') {
      warnings.push(`前端 ${r.source} 直连中间件 ${r.target}（${r.label || r.relationType}）：确认是否应经应用服务 / BFF`)
    }
    // 约定：depends_on 用于依赖中间件/基础设施；服务间运行时调用应使用 calls
    if (r.relationType === 'depends_on' && tLayer === 'application') {
      warnings.push(`关系 ${r.id}（${r.source} → ${r.target}）用 depends_on 指向应用层，按约定服务间调用应使用 calls`)
    }
  })

  const rels = data.relations || []
  const noContract = rels.filter((r) => !r.contract || !r.contract.kind).length
  if (rels.length && noContract) {
    warnings.push(`${noContract}/${rels.length} 条关系未填写依赖契约 contract（接口/topic/表），代码级定位精度受限`)
  }
  const noContractTarget = rels.filter((r) => !r.contract || !r.contract.target).length
  if (rels.length && noContractTarget && !noContract) {
    const fam = { 内部服务: 0, Nacos: 0, 关系型库: 0, 消息中间件: 0, 其他: 0 }
    const nameOfNode = (id: string) => ((data.nodes.find((n) => n.id === id) || {}).name || '') + ' ' + id
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
    warnings.push(
      `契约定位：${located}/${rels.length} 已定位到具体落点；其余 ${noContractTarget} 条只有 contract.kind（${famDetail}）` +
        `。内部服务需 API 网关路径表；注册中心类依赖本无接口契约`,
    )
  }

  // 证据出处覆盖率：回答「这条依赖凭什么成立」
  const noEvidence = rels.filter((r) => !r.evidence || !r.evidence.kind).length
  if (rels.length && noEvidence) {
    warnings.push(`${noEvidence}/${rels.length} 条关系未填写 evidence 出处（代码/配置/网关/Nacos/台账/文档），结论无法溯源`)
  }
  // 需人工复核的关系：doubtful / absent / refutes（口径与 scripts/validate-topology.mjs 一致）
  const ev = evidenceSummary(rels)
  if (ev.needsReview) {
    const doubtful = rels.filter((r) => r.confidence === 'doubtful')
    const head = doubtful.slice(0, 5).map((r) => r.id).join('、')
    const pending = Object.entries(ev.byPending).map(([k, v]) => (PENDING_DATA_LABELS[k as keyof typeof PENDING_DATA_LABELS] || k) + ' ' + v).join(' · ')
    warnings.push(
      `${ev.needsReview} 条关系需人工复核（refutes ${ev.byVerdict.refutes} / absent ${ev.byVerdict.absent} / doubtful ${doubtful.length}）：` +
        `不可用于对外承诺；在等什么：${pending}；doubtful：${head}${doubtful.length > 5 ? ' 等' : ''}`,
    )
  }
  // 「填了 evidence 字段」≠「核实过」：把覆盖度摆出来，避免被读成 100%
  if (rels.length && ev.verified < rels.length) {
    warnings.push(
      `证据覆盖：${ev.withSource}/${rels.length} 有来源标注、${ev.verified} 已核实（${Math.round((ev.verified / rels.length) * 100)}%）：` +
        `可用于对外承诺仅 ${ev.committable} 条`,
    )
  }
  // 系统级关系须挂在系统代表节点上，否则视图无法上提
  const primaryIdSet = new Set(primaryNodes.map((n) => n.id))
  rels.forEach((r) => {
    if (r.scope === 'system' && !primaryIdSet.has(r.source) && !primaryIdSet.has(r.target)) {
      warnings.push(
        `关系 ${r.id} 标为系统级 scope，但两端都不是系统代表节点（${r.source} → ${r.target}）：请改挂代表节点或降级为节点级`,
      )
    }
  })
  // 系统级边锚在接入层节点上：该系统在图谱里没有后端节点，锚点只是句柄
  // BFF 是服务端组件，作为系统锚点是合理的，不算「缺后端节点」
  const sysOnAccess = rels.filter((r) => {
    const sn = nodeById.get(r.source)
    return r.scope === 'system' && nodeLayer(sn!) === 'access' && sn?.appType !== 'bff'
  })
  if (sysOnAccess.length) {
    const sysSet = new Set(sysOnAccess.map((r) => nodeById.get(r.source)?.systemId).filter(Boolean))
    warnings.push(
      `${sysOnAccess.length} 条系统级边锚定在接入层节点上（该系统缺后端节点，锚点仅作句柄）：${[...sysSet].slice(0, 6).join('、')}${sysSet.size > 6 ? ' 等' : ''}`,
    )
  }

  // 业务线分组 children 引用
  const blDataIds = new Set((data.businessLines || []).map((b) => b.id))
  ;(data.businessLineGroups || []).forEach((g) => {
    ;(g.children || []).forEach((c) => {
      if (!blDataIds.has(c)) errors.push(`业务线分组 ${g.id} 包含不存在的业务线：${c}`)
    })
  })

  // 业务域词表：数据声明即权威（未声明时回退内置默认）
  const domainRegistry = data.domains?.length ? data.domains : DOMAIN_REGISTRY
  const domainIds = new Set<string>()
  ;(data.domains || []).forEach((dm, i) => {
    if (!dm.id) errors.push(`domains[${i}] 缺少 id`)
    else if (domainIds.has(dm.id)) errors.push(`业务域 id 重复：${dm.id}`)
    else domainIds.add(dm.id)
    if (!dm.name) warnings.push(`业务域 ${dm.id || `[${i}]`} 缺少名称`)
    if (!dm.color) warnings.push(`业务域 ${dm.id || `[${i}]`} 缺少颜色`)
  })
  // 业务线可声明主责业务域，声明了就必须在词表里
  ;(data.businessLines || []).forEach((bl) => {
    if (bl.domain && !resolveDomainId(bl.domain, domainRegistry)) {
      errors.push(`业务线 ${bl.id} 的 domain 不在业务域词表：${bl.domain}`)
    }
  })

  // 业务流：域 + 主责业务线 + 步骤节点引用
  const flowIds = new Set<string>()
  ;(data.businessFlows || []).forEach((f, i) => {
    if (!f.id) errors.push(`businessFlows[${i}] 缺少 id`)
    else if (flowIds.has(f.id)) errors.push(`业务流 id 重复：${f.id}`)
    else flowIds.add(f.id)
    if (f.domain && !resolveDomainId(f.domain, domainRegistry)) errors.push(`业务流 ${f.id} 的 domain 不在业务域词表：${f.domain}`)
    if (f.businessLine && !blIds.has(f.businessLine)) errors.push(`业务流 ${f.id} 的 businessLine 不在业务线注册表：${f.businessLine}`)
    ;(f.steps || []).forEach((s, j) => {
      if (!nodeIds.has(s.nodeId)) errors.push(`业务流 ${f.id} 步骤[${j}] 指向不存在的系统节点：${s.nodeId}`)
    })
  })

  // 流程宿主引擎词表（数据声明优先，缺省用内置默认）
  const hostMaps = buildProcessHostMaps(data)
  ;(data.processHosts || []).forEach((h, i) => {
    if (!h.id) errors.push(`processHosts[${i}] 缺少 id`)
    if (!h.name) warnings.push(`宿主引擎 ${h.id || `[${i}]`} 缺少名称`)
    if (!h.color) warnings.push(`宿主引擎 ${h.id || `[${i}]`} 缺少颜色`)
  })

  // 业务流程目录
  const pc = data.processCatalog
  if (pc) {
    const procIds = new Set<string>()
    pc.domains.forEach((dom) => {
      if (!resolveDomainId(dom.id, domainRegistry)) errors.push(`流程板块 domain 不在业务域词表：${dom.id}`)
      dom.groups.forEach((g) => {
        g.processes.forEach((p) => {
          if (procIds.has(p.id)) errors.push(`流程 id 重复：${p.id}`)
          else procIds.add(p.id)
          ;(p.systems || []).forEach((sid) => {
            if (!nodeIds.has(sid)) errors.push(`流程 ${p.id} 关联的系统不存在：${sid}`)
          })
          ;(p.flows || []).forEach((fid) => {
            if (!flowIds.has(fid)) errors.push(`流程 ${p.id} 关联的业务流不存在：${fid}`)
          })
          if (p.host && !hostMaps.labels[p.host]) {
            errors.push(`流程 ${p.id} 的宿主引擎不在词表：${p.host}（在 processHosts 中声明，或留空）`)
          }
        })
      })
    })
    pc.dependencies.forEach((dep, i) => {
      if (!procIds.has(dep.from)) errors.push(`流程依赖[${i}] from 指向不存在的流程：${dep.from}`)
      if (!procIds.has(dep.to)) errors.push(`流程依赖[${i}] to 指向不存在的流程：${dep.to}`)
    })

    // 提醒：无宿主的流程（非错误）
    const unknownHost = pc.domains.flatMap((d) => d.groups.flatMap((g) => g.processes.filter((p) => !p.host)))
    if (unknownHost.length) warnings.push(`${unknownHost.length} 个流程未标注宿主引擎`)
  }

  // 目录↔业务流 桥接完整性（仅提醒，不阻断保存）
  const referencedFlows = new Set<string>()
  pc?.domains.forEach((dom) => dom.groups.forEach((g) => g.processes.forEach((p) => (p.flows || []).forEach((fid) => referencedFlows.add(fid)))))
  ;(data.businessFlows || []).forEach((f) => {
    if (!referencedFlows.has(f.id)) warnings.push(`业务流 ${f.id}（${f.name}）未被任何流程目录项引用`)
  })
  if (pc) {
    const noFlow = pc.domains.flatMap((d) => d.groups.flatMap((g) => g.processes.filter((p) => !p.flows || p.flows.length === 0)))
    if (noFlow.length) warnings.push(`${noFlow.length} 个流程未关联任何业务流（流程目录 ↔ 端到端业务流 桥接不完整）`)
  }

  return { ok: errors.length === 0, errors, warnings }
}
