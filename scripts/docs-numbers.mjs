#!/usr/bin/env node
/**
 * 文档数字快照 —— 一条命令生成「写进云文档的数字块」，避免手抄导致口径漂移。
 *
 *   npm run docs:numbers            # 打印 markdown 表格
 *   npm run docs:numbers -- --json  # 机器可读（给后续自动同步脚本用）
 *
 * 为什么需要：云文档里的数字散落在 5 份材料里，每次数据变动都要人肉找一遍
 * （本会话已经因为漏改/口径变化返工过两次）。这里把口径收敛成**一处输出**。
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { dataFile } from './lib/data-file.mjs'

const JSON_OUT = process.argv.includes('--json')
const data = JSON.parse(fs.readFileSync(dataFile(), 'utf8'))
const { evidenceSummary } = await import(pathToFileURL(path.join(process.cwd(), 'src/lib/evidence.ts')).href)
const { computeImpact, summarizeImpact } = await import(pathToFileURL(path.join(process.cwd(), 'src/lib/impact.ts')).href)

const tally = (a) => a.reduce((m, x) => { m[x] = (m[x] || 0) + 1; return m }, {})
const L = tally(data.nodes.map((n) => n.layer))
const R = tally(data.relations.map((r) => r.relationType))
const prod = data.nodes.filter((n) => n.environments && n.environments.production)
const ev = evidenceSummary(data.relations)
const withTarget = data.relations.filter((r) => r.contract && r.contract.target).length
const withKind = data.relations.filter((r) => r.contract && r.contract.kind).length
const er = data.entryRoutes || []
const noHttps = er.filter((r) => r.https === false).length
const mysql = summarizeImpact(data, computeImpact(data, 'mysql', 3))
const cost = summarizeImpact(data, computeImpact(data, 'cost-control', 3))

const S = {
  节点: data.nodes.length,
  关系: data.relations.length,
  系统: (data.systems || []).length,
  已归属节点: data.nodes.filter((n) => n.systemId).length,
  分层: '接入 ' + L.access + ' · 应用 ' + L.application + ' · 平台 ' + L.platform + ' · 中间件 ' + L.middleware + ' · 基础设施 ' + L.infrastructure + ' · 外部 ' + L.external,
  关系类型: '调用 ' + R.calls + ' · 依赖 ' + R.depends_on + ' · 订阅 ' + R.subscribes_from + ' · 发布 ' + R.publishes_to + ' · 同步 ' + R.syncs_with,
  业务流: data.businessFlows.length,
  业务流程: (() => { let c = 0; data.processCatalog.domains.forEach((d) => d.groups.forEach((g) => { c += g.processes.length })); return c })(),
  仓库: new Set(data.nodes.map((n) => n.links && n.links.repo).filter(Boolean)).size,
  团队: new Set(data.nodes.map((n) => n.owner).filter(Boolean)).size,
  生产环境: prod.length + ' 登记 / ' + prod.filter((n) => n.environments.production.status === 'running').length + ' 运行',
  契约: withTarget + '/' + data.relations.length + ' 已定位（类型 ' + withKind + '/' + data.relations.length + '）',
  证据: ev.withSource + ' 有来源 / ' + ev.verified + ' 已核实 / ' + ev.committable + ' 可承诺 / ' + ev.needsReview + ' 需复核',
  置信度: '高 ' + (data.relations.filter((r) => r.confidence === 'high').length) + ' · 中 ' + (data.relations.filter((r) => r.confidence === 'medium').length) + ' · 低 ' + (data.relations.filter((r) => r.confidence === 'low').length) + ' · 存疑 ' + (data.relations.filter((r) => r.confidence === 'doubtful').length),
  入口层: er.length + ' 路由 / ' + new Set(er.map((r) => r.domain).filter(Boolean)).size + ' 域名 / ' + er.filter((r) => r.nodeId).length + ' 已映射 / ' + noHttps + ' 未强制 HTTPS',
  影响面MySQL: '上游 ' + mysql.upstream + ' / 下游 ' + mysql.downstream + ' / 流程 ' + mysql.processes + ' / 仓库 ' + mysql.repos,
  影响面费控: '上游 ' + cost.upstream + ' / 下游 ' + cost.downstream + ' / 流程 ' + cost.processes + ' / 仓库 ' + cost.repos,
}

if (JSON_OUT) { console.log(JSON.stringify(S, null, 2)) } else {
  console.log('## 数据快照（' + new Date().toLocaleString('sv-SE') + '）')
  console.log('')
  console.log('| 项 | 值 |')
  console.log('|---|---|')
  Object.entries(S).forEach(([k, v]) => console.log('| ' + k + ' | ' + v + ' |'))
  console.log('')
  console.log('> 生成：`npm run docs:numbers`（口径唯一来源，改数字请用这条命令重出，不要手抄）')
}
