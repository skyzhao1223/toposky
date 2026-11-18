#!/usr/bin/env node
/**
 * 数据可信度报告：按系统汇总依赖关系的证据强度分层。
 *
 *   node scripts/data-quality-report.mjs [--out report.md]
 *
 * 回答「这套图谱的数据，哪些能信、哪些要复核、怎么用」。
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { dataDisplay, dataFile } from './lib/data-file.mjs'

const args = process.argv.slice(2)
const OUT = (() => { const i = args.indexOf('--out'); return i >= 0 && args[i + 1] ? args[i + 1] : '' })()
const data = JSON.parse(fs.readFileSync(dataFile(), 'utf8'))
// 证据口径只此一处：复用 src/lib/evidence.ts（Node 原生可直接 import .ts）
const { describeEvidence, evidenceSummary } = await import(
  pathToFileURL(path.join(process.cwd(), 'src/lib/evidence.ts')).href
)
const { PENDING_DATA_LABELS } = await import(
  pathToFileURL(path.join(process.cwd(), 'src/types/index.ts')).href
)
const EVIDENCE = evidenceSummary(data.relations)
const CONF = ['high', 'medium', 'low', 'doubtful']

const systemName = (id) => (data.systems || []).find((s) => s.id === id)?.name || id
const nodeSystem = Object.fromEntries(data.nodes.map((n) => [n.id, n.systemId]))

// 总览
const total = data.relations.length
const overall = Object.fromEntries(CONF.map((c) => [c, data.relations.filter((r) => r.confidence === c).length]))
const withEvidence = data.relations.filter((r) => r.evidence && r.evidence.kind).length
const withVerdict = data.relations.filter((r) => r.evidence?.verdict).length
const withContract = data.relations.filter((r) => r.contract && (r.contract.kind || r.contract.target)).length

// 按系统（边的任一端属于该系统即计入）
const rows = []
for (const sys of (data.systems || []).map((s) => s.id).sort()) {
  const rels = data.relations.filter((r) => nodeSystem[r.source] === sys || nodeSystem[r.target] === sys)
  if (!rels.length) continue
  const counts = Object.fromEntries(CONF.map((c) => [c, rels.filter((r) => r.confidence === c).length]))
  const nodes = data.nodes.filter((n) => n.systemId === sys).length
  const repoNames = new Set(rels.filter((r) => nodeSystem[r.source] === sys).map((r) => r.target))
  const verified = rels.filter((r) => r.evidence?.verdict).length
  const conflicts = rels.filter((r) => r.evidence?.verdict === 'refutes').length
  rows.push({ sys, nodes, rel: rels.length, ...counts, verified, conflicts, known: repoNames.size })
}
rows.sort((a, b) => b.high - a.high)

const L = []
L.push('# 数据可信度报告')
L.push('')
const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
// 用本机时区，避免 toISOString() 的 UTC 偏移让人误读成「旧数据」
const stamp = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
  ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds())
L.push('> 生成时间：' + stamp + '（本机时区）')
L.push('> 源：`' + dataDisplay() + '`（' + data.nodes.length + ' 节点 / ' + (data.systems || []).length + ' 系统 / ' + total + ' 关系）')
L.push('')
L.push('## 一、总览')
L.push('')
L.push('| confidence | 条数 | 占比 | 可用于 |')
L.push('|---|---|---|---|')
const use = { high: '**对外承诺 / 变更决策**', medium: '参考、圈定范围', low: '**仅作线索，需复核**', doubtful: '**不可对外承诺**' }
CONF.forEach((c) => L.push('| `' + c + '` | ' + overall[c] + ' | ' + ((overall[c] / total) * 100).toFixed(0) + '% | ' + use[c] + ' |'))
L.push('')
const highNoVerdict = data.relations.filter((r) => r.confidence === 'high' && !r.evidence?.verdict).length
const withContractTarget = data.relations.filter((r) => r.contract?.target).length
L.push('- 有 `contract.kind` 的关系：**' + withContract + '/' + total + '**（其中**只有语义推导、未定位到接口**的占多数）')
L.push('- **真正定位到接口/topic/表（有 `contract.target`）的：' + withContractTarget + '/' + total + '**（' + ((withContractTarget / total) * 100).toFixed(0) + '%）')
L.push('')
L.push('> ⚠️ **`contract.kind` 里有 ' + (withContract - withContractTarget) + ' 条是按 `relationType` + 目标层级推导出来的**，')
L.push('> 不是从代码里定位到的接口。要精确定位仍需补 `contract.target`。')
L.push('- 填了 `evidence` 字段的关系：**' + withEvidence + '/' + total + '**')
L.push('- **真正做过代码核实（有 `evidence.verdict`）的：' + withVerdict + '/' + total + '**（' + ((withVerdict / total) * 100).toFixed(0) + '%）')
L.push('')
L.push('> ⚠️ **「填了 evidence 字段」≠「核实过」**。本项目里两者差 ' + (total - withVerdict) + ' 条。')
L.push('- 证据结论分布：' + Object.entries(EVIDENCE.byVerdict).filter(([, v]) => v > 0).map(([k, v]) => '`' + k + '` ' + v).join(' / '))
L.push('- **可用于变更决策 / 对外承诺（high + 已核实 + supports）：' + EVIDENCE.committable + '/' + total + '**')
L.push('- **需人工复核（doubtful / 无证据 / 有反证）：' + EVIDENCE.needsReview + '/' + total + '**')
if (EVIDENCE.verdictButDoubtful > 0) {
  L.push('> ⚠️ 其中 ' + EVIDENCE.verdictButDoubtful + ' 条 `verdict=supports` 但 `confidence=doubtful` —— **证据支持 ≠ 可承诺**，需人工定夺。')
}
if (highNoVerdict > 0) {
  L.push('> 其中 **' + highNoVerdict + ' 条还是 `confidence: high`** —— 靠编译产物/台账推出、未走代码核实，引用时请自行判断。')
} else {
  L.push('> 好消息：**没有 `confidence: high` 的关系落在未核实区间** —— 所有 high 都有核实结论。')
}
L.push('- 节点 `repoPath` 覆盖：**' + data.nodes.filter((n) => n.repoPath).length + '/' + data.nodes.length + '**')
L.push('')
L.push('## 二、按系统（按 high 条数降序）')
L.push('')
L.push('| 系统 | 节点 | 相关关系 | high | medium | low | doubtful | 已核实 | 反证 |')
L.push('|---|---|---|---|---|---|---|---|---|')
rows.forEach((r) =>
  L.push(
    '| ' + systemName(r.sys) + '（`' + r.sys + '`） | ' + r.nodes + ' | ' + r.rel + ' | ' + r.high + ' | ' + r.medium + ' | ' + r.low + ' | ' + r.doubtful + ' | ' + r.verified + ' | ' + r.conflicts + ' |',
  ),
)
L.push('')
// 入口层
const er = data.entryRoutes || []
if (er.length) {
  const domains = new Set(er.map((r) => r.domain))
  const mapped = er.filter((r) => r.nodeId).length
  const noHttps = er.filter((r) => r.https === false).length
  const byEnv = er.reduce((a, r) => { a[r.env] = (a[r.env] || 0) + 1; return a }, {})
  // 需复核清单（口径来自 src/lib/evidence.ts，避免各页面/报告各写一套）
const review = data.relations.filter((r) => describeEvidence(r).needsReview)
if (review.length) {
  const nodeName = (id) => (data.nodes.find((n) => n.id === id) || {}).name || id
  L.push('## 三、需复核清单（' + review.length + ' 条）')
  L.push('')
  L.push('> `refutes`＝有反证，应按「该依赖不成立」处理；`absent`＝按该来源**没搜到**（可能方法不对），不等于不存在；`doubtful`＝来源自注存疑。')
  L.push('')
  L.push('| 关系 | 可信度 | 证据类型 | 出处 | 结论 | 在等什么 |')
  L.push('|---|---|---|---|---|---|')
  review.slice(0, 40).forEach((r) => {
    const v = describeEvidence(r)
    const pending = v.pendingData ? PENDING_DATA_LABELS[v.pendingData] || v.pendingData : '—'
    L.push('| `' + r.id + '` ' + nodeName(r.source) + ' → ' + nodeName(r.target) + ' | ' + v.confidenceLabel + ' | ' + (v.kindLabel || '-') + ' | ' + (v.ref || '-') + ' | ' + v.headline + ' | ' + pending + ' |')
  })
  if (review.length > 40) {
    L.push('')
    L.push('> 仅列前 40 条（共 ' + review.length + ' 条）；完整清单用 `npm run report:quality -- --out report.md` 落盘后检索。')
  }
  L.push('')
}

L.push('## 四、入口层（网关转发规则）')
  L.push('')
  L.push('| 指标 | 数值 |')
  L.push('|---|---|')
  L.push('| 路由条数 | ' + er.length + ' |')
  L.push('| 域名数 | ' + domains.size + ' |')
  L.push('| 按环境 | ' + Object.entries(byEnv).map(([k, v]) => k + ' ' + v).join(' / ') + ' |')
  L.push('| 已映射到节点 | ' + mapped + ' / ' + er.length + '（未映射的不猜） |')
  L.push('| **未强制 HTTPS** | **' + noHttps + ' / ' + er.length + '** |')
  L.push('')
  L.push('> 入口层来自网关真实配置（域名 → 路径 → 后端应用）。')
  L.push('')
}

L.push('## 五、使用口径')
L.push('')
L.push('| 场景 | 用哪一档 |')
L.push('|---|---|')
L.push('| 变更决策 / 对外承诺 / SLO | 只看 `high` |')
L.push('| 圈定影响范围、通知团队 | `high + medium` |')
L.push('| 决定「去哪查」 | `low + doubtful`（**不用来决定「会不会出事」**） |')
L.push('| 影响分析具体结论 | 看该条路径的**最弱一环**（`/impact` 页面已按此标注） |')
L.push('')
L.push('> `doubtful` 里已有代码/依赖树反证的，应视为「该依赖不成立」，用于排查误配与幽灵依赖。')
L.push('')

const text = L.join('\n')
console.log(text)
if (OUT) { fs.writeFileSync(OUT, text); console.log('\n已写入 ' + OUT) }
