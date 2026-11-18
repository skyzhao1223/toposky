#!/usr/bin/env node
/**
 * Backstage 目录互通（catalog-info.yaml ↔ topology.json）
 *
 *   node scripts/backstage.mjs export --out <dir>            # 导出为 Backstage 目录
 *   node scripts/backstage.mjs import --file <yaml|dir> [--apply]   # 从 Backstage 导入（默认 dry-run）
 *
 * 设计约束（与 AGENTS.md 一致）：
 *   1. **不猜**：映射不上就留空并进「未解析清单」，不写看似合理的错值；
 *   2. **不覆盖人工数据**：import 只补空字段、只追加不存在的实体（幂等）；
 *   3. **先校验后落盘**：--apply 前写临时文件跑一遍 CI 校验器，有 error 直接中止；
 *   4. **示例数据拒绝写入**：读的是仓库自带示例时，import --apply 直接报错。
 *
 * 映射口径见 docs/BACKSTAGE.md。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import yaml from 'js-yaml'
import { dataFile, dataDisplay, dataIsDemo } from './lib/data-file.mjs'

const args = process.argv.slice(2)
const cmd = args[0]
const opt = (name, def = '') => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const has = (name) => args.includes(`--${name}`)
const allOpts = (name) => args.reduce((acc, a, i) => (a === `--${name}` && args[i + 1] ? [...acc, args[i + 1]] : acc), [])

/* ============================== 通用 ============================== */

const KIND_ORDER = ['Group', 'System', 'Component', 'Resource', 'API']
const LAYER_OF = (n) => n.layer || n.category || 'application'

/** Backstage 实体名：^[a-zA-Z0-9]([-a-zA-Z0-9_.]*[a-zA-Z0-9])?$，≤63 */
function entityName(raw, fallback = 'entity') {
  const s = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
  const cut = s.slice(0, 63).replace(/[^a-z0-9]+$/g, '')
  return cut || fallback
}

const isApp = (n) => ['access', 'application'].includes(LAYER_OF(n))
const entityKindOf = (n) => (isApp(n) ? 'component' : 'resource')

const COMPONENT_TYPE = { frontend: 'website', bff: 'service', backend: 'service', fullstack: 'service' }
const RESOURCE_TYPE = (n) => {
  const key = `${n.id} ${n.name}`.toLowerCase()
  if (/mysql|postgres|sqlserver|oracle|dameng|tidb|数据库|rds/.test(key)) return 'database'
  if (/redis|memcache|缓存/.test(key)) return 'cache'
  if (/kafka|rocketmq|rabbit|mq|消息/.test(key)) return 'message-queue'
  if (/nacos|config|配置/.test(key)) return 'configuration'
  if (/k8s|kubernetes|集群|cluster/.test(key)) return 'cluster'
  if (LAYER_OF(n) === 'external') return 'external'
  return 'other'
}

function apiNameFor(node) {
  return entityName(`api-${node.id}`, 'api')
}

/* ============================== export ============================== */

function toEntity(kind, name, extra) {
  return { apiVersion: 'backstage.io/v1alpha1', kind, metadata: { name, ...extra.metadata }, spec: extra.spec }
}

function buildCatalog(data) {
  const entities = []
  const systems = data.systems || []
  const nodes = data.nodes || []

  // 团队（Group）：原团队名放 title/displayName，实体名用稳定的 team-N
  const owners = [...new Set([...systems.map((s) => s.owner), ...nodes.map((n) => n.owner)].filter(Boolean))].sort()
  const teamOf = new Map(owners.map((o, i) => [o, `team-${i + 1}`]))
  owners.forEach((o) => {
    const name = teamOf.get(o)
    entities.push(
      toEntity('Group', name, {
        metadata: { title: o, description: o },
        spec: { type: 'team', profile: { displayName: o } },
      }),
    )
  })

  // 系统（System）
  systems.forEach((s) => {
    entities.push(
      toEntity('System', entityName(s.id, 'system'), {
        metadata: {
          title: s.name,
          description: s.description,
          annotations: {
            'toposky/id': s.id,
            'toposky/name': s.name,
            ...(s.businessLine ? { 'toposky/business-line': s.businessLine } : {}),
            ...(s.owner ? { 'toposky/owner': s.owner } : {}),
          },
        },
        spec: {
          type: 'system',
          owner: s.owner ? teamOf.get(s.owner) : 'team-unknown',
          ...(s.owner ? {} : { lifecycle: undefined }),
        },
      }),
    )
  })

  // 节点（Component / Resource）
  const nodeEntityName = new Map()
  nodes.forEach((n) => {
    const name = entityName(n.id, `node-${nodeEntityName.size + 1}`)
    nodeEntityName.set(n.id, name)
  })

  // API：把 http/rpc 契约表示为 API 实体（providesApis / consumesApis）
  const apis = new Map() // providerNodeId -> { name, targets:Set<string>, consumers:Set<string> }
  ;(data.relations || []).forEach((r) => {
    if (!r.contract || !['http', 'rpc'].includes(r.contract.kind)) return
    const provider = nodes.find((n) => n.id === r.target)
    if (!provider || !isApp(provider)) return
    if (!apis.has(provider.id)) apis.set(provider.id, { name: apiNameFor(provider), targets: new Set(), consumers: new Set() })
    const api = apis.get(provider.id)
    api.targets.add(r.contract.target || '（未定位到具体落点）')
    if (r.source !== provider.id) api.consumers.add(r.source)
  })

  nodes.forEach((n) => {
    const layer = LAYER_OF(n)
    const annotations = {
      'toposky/id': n.id,
      'toposky/name': n.name,
      'toposky/layer': layer,
      ...(n.businessLine ? { 'toposky/business-line': n.businessLine } : {}),
      ...(n.owner ? { 'toposky/owner': n.owner } : {}),
    }
    const links = []
    if (n.links?.repo) links.push({ url: n.links.repo, title: '仓库' })
    if (n.links?.wiki) links.push({ url: n.links.wiki, title: '文档' })

    const dependsOn = (data.relations || [])
      .filter((r) => r.source === n.id && nodes.some((t) => t.id === r.target))
      .filter((r) => {
        // 由 API 表达的边（http/rpc 且目标是应用节点）不再重复写 dependsOn
        if (!r.contract || !['http', 'rpc'].includes(r.contract.kind)) return true
        const t = nodes.find((x) => x.id === r.target)
        return !t || !isApp(t)
      })
      .map((r) => {
        const t = nodes.find((x) => x.id === r.target)
        return `${entityKindOf(t)}:${nodeEntityName.get(t.id)}`
      })

    if (isApp(n)) {
      const api = apis.get(n.id)
      const consumes = [...apis.entries()].filter(([, a]) => a.consumers.has(n.id)).map(([, a]) => a.name)
      entities.push(
        toEntity('Component', nodeEntityName.get(n.id), {
          metadata: { title: n.name, description: n.description, annotations, ...(links.length ? { links } : {}) },
          spec: {
            type: COMPONENT_TYPE[n.appType] || 'service',
            lifecycle: 'production',
            owner: n.owner ? teamOf.get(n.owner) : 'team-unknown',
            ...(n.systemId ? { system: entityName(n.systemId) } : {}),
            ...(dependsOn.length ? { dependsOn: [...new Set(dependsOn)] } : {}),
            ...(api ? { providesApis: [api.name] } : {}),
            ...(consumes.length ? { consumesApis: [...new Set(consumes)] } : {}),
          },
        }),
      )
    } else {
      entities.push(
        toEntity('Resource', nodeEntityName.get(n.id), {
          metadata: { title: n.name, description: n.description, annotations, ...(links.length ? { links } : {}) },
          spec: {
            type: RESOURCE_TYPE(n),
            owner: n.owner ? teamOf.get(n.owner) : 'team-unknown',
            ...(n.systemId ? { system: entityName(n.systemId) } : {}),
            ...(dependsOn.length ? { dependsOn: [...new Set(dependsOn)] } : {}),
          },
        }),
      )
    }
  })

  // API 实体（契约落点作为 definition 注释；type 用 other，避免假装是完整 OpenAPI）
  apis.forEach((api, providerId) => {
    const provider = nodes.find((n) => n.id === providerId)
    const def = ['# 由 toposky 导出的契约落点（非完整 API 定义）', ...[...api.targets].map((t) => `#   ${t}`)].join('\n')
    entities.push(
      toEntity('API', api.name, {
        metadata: {
          title: `${provider.name} 对外契约`,
          description: `从依赖关系契约推导（${api.targets.size} 个落点）`,
          annotations: { 'toposky/provider': provider.id },
        },
        spec: {
          type: 'other',
          lifecycle: 'production',
          owner: provider.owner ? teamOf.get(provider.owner) : 'team-unknown',
          definition: def,
        },
      }),
    )
  })

  const rank = (k) => (KIND_ORDER.includes(k) ? KIND_ORDER.indexOf(k) : 99)
  return entities.sort((a, b) => rank(a.kind) - rank(b.kind) || a.metadata.name.localeCompare(b.metadata.name))
}

function runExport() {
  const out = opt('out')
  if (!out) {
    console.error('用法: node scripts/backstage.mjs export --out <目录或文件>')
    process.exit(2)
  }
  const data = JSON.parse(fs.readFileSync(dataFile(), 'utf-8'))
  const entities = buildCatalog(data)
  const target = out.endsWith('.yaml') || out.endsWith('.yml') ? out : path.join(out, 'catalog-info.yaml')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const body = entities.map((e) => yaml.dump(e, { lineWidth: -1, noRefs: true })).join('---\n')
  fs.writeFileSync(target, body, 'utf-8')

  const counts = entities.reduce((m, e) => ((m[e.kind] = (m[e.kind] || 0) + 1), m), {})
  console.log(`数据源：${dataDisplay()}${dataIsDemo() ? '（示例数据）' : ''}`)
  console.log(`已导出 ${entities.length} 个实体 → ${target}`)
  console.log('  ' + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · '))
  if (!dataIsDemo()) {
    console.log('⚠️  当前是实例数据：导出文件可能含内部信息，不要直接提交到公开仓库。')
  }
}

/* ============================== import ============================== */

const readYamlFiles = (inputs) => {
  const files = []
  inputs.forEach((p) => {
    const abs = path.resolve(p)
    if (!fs.existsSync(abs)) throw new Error(`文件不存在：${p}`)
    if (fs.statSync(abs).isDirectory()) {
      fs.readdirSync(abs)
        .filter((f) => /\.(ya?ml)$/i.test(f))
        .forEach((f) => files.push(path.join(abs, f)))
    } else files.push(abs)
  })
  return files
}

function loadEntities(files) {
  const entities = []
  files.forEach((file) => {
    const docs = yaml.loadAll(fs.readFileSync(file, 'utf-8'))
    docs.filter(Boolean).forEach((d) => {
      if (d.kind && d.metadata?.name) {
        const rel = path.relative(process.cwd(), file)
        entities.push({ ...d, __file: rel.startsWith('..') ? path.basename(file) : rel })
      }
    })
  })
  return entities
}

function refTarget(ref) {
  const clean = String(ref).replace(/^default\//, '')
  const [kind, name] = clean.includes(':') ? clean.split(':') : ['', clean]
  return { kind: kind.toLowerCase(), name: name.replace(/^default\//, '') }
}

function inferLayer(e) {
  const ann = e.metadata.annotations?.['toposky/layer']
  if (ann) return ann
  if (e.kind === 'Component') return /website|frontend|app/i.test(e.spec?.type || '') ? 'access' : 'application'
  if (e.kind === 'Resource') {
    const t = String(e.spec?.type || '').toLowerCase()
    if (/database|cache|message-queue|configuration|storage|queue|mq/.test(t)) return 'middleware'
    if (/cluster|host|network|infra/.test(t)) return 'infrastructure'
    if (/external|saas|vendor/.test(t)) return 'external'
    return 'middleware'
  }
  return 'application'
}

function buildImport(entities, data) {
  const groupTitle = new Map()
  entities.filter((e) => e.kind === 'Group').forEach((g) => {
    groupTitle.set(g.metadata.name, g.metadata.title || g.spec?.profile?.displayName || g.metadata.name)
  })
  const ownerName = (slug) => groupTitle.get(slug) || slug

  const diff = { systems: [], nodes: [], relations: [], unresolved: [], conflicts: [] }
  const existingNodeIds = new Set((data.nodes || []).map((n) => n.id))
  const nodeByEntity = new Map() // entity name -> node id

  // 实体 → 节点/系统候选
  entities.forEach((e) => {
    if (e.kind !== 'Component' && e.kind !== 'Resource') return
    const ann = e.metadata.annotations || {}
    const id = ann['toposky/id'] || e.metadata.name
    nodeByEntity.set(e.metadata.name, id)
    const layer = inferLayer(e)
    const links = {}
    ;(e.metadata.links || e.spec?.links || []).forEach((l) => {
      if (!l?.url) return
      if (/repo|仓库|git/i.test(l.title || '') || /\.git$/.test(l.url)) links.repo ??= l.url
      else links.wiki ??= l.url
    })
    const node = {
      id,
      name: ann['toposky/name'] || e.metadata.title || e.metadata.name,
      description: e.metadata.description || ann['toposky/name'] || e.metadata.name,
      category: layer,
      layer,
      ...(e.kind === 'Component' ? { appType: /website/i.test(e.spec?.type || '') ? 'frontend' : 'backend' } : {}),
      ...(e.spec?.owner ? { owner: ownerName(e.spec.owner) } : {}),
      ...(e.spec?.system ? { systemId: entityName(e.spec.system) } : {}),
      ...(Object.keys(links).length ? { links } : {}),
      ...(ann['toposky/business-line'] ? { businessLine: ann['toposky/business-line'] } : {}),
      __file: e.__file,
    }
    diff.nodes.push(node)
  })

  entities.forEach((e) => {
    if (e.kind !== 'System') return
    const ann = e.metadata.annotations || {}
    const id = ann['toposky/id'] || e.metadata.name
    diff.systems.push({
      id,
      name: ann['toposky/name'] || e.metadata.title || e.metadata.name,
      ...(e.spec?.owner ? { owner: ownerName(e.spec.owner) } : {}),
      ...(ann['toposky/business-line'] ? { businessLine: ann['toposky/business-line'] } : {}),
      ...(e.metadata.description ? { description: e.metadata.description } : {}),
    })
  })

  // 关系：dependsOn + API 消费
  const apiProvider = new Map() // api entity name -> provider node id
  entities.filter((e) => e.kind === 'API').forEach((a) => {
    const provider = entities.find((c) => c.kind === 'Component' && (c.spec?.providesApis || []).includes(a.metadata.name))
    if (!provider) {
      diff.unresolved.push({ ref: `api:${a.metadata.name}`, reason: '没有 Component 声明 providesApis' })
      return
    }
    apiProvider.set(a.metadata.name, provider)
  })

  const pushRelation = (source, target, targetRefName, relationType, contract, ref) => {
    if (!source) {
      diff.unresolved.push({ ref, reason: `source 未解析（不是 Component/Resource）` })
      return
    }
    if (!target) {
      diff.unresolved.push({ ref, reason: `target 未解析：${targetRefName || '?'}` })
      return
    }
    if (source === target) return
    diff.relations.push({
      id: `bs-${crypto.createHash('sha1').update(`${source}|${target}|${relationType}`).digest('hex').slice(0, 10)}`,
      source,
      target,
      relationType,
      ...(contract ? { contract } : {}),
      confidence: 'medium',
      evidence: { kind: 'doc', ref },
    })
  }

  entities.forEach((e) => {
    if (e.kind !== 'Component' && e.kind !== 'Resource') return
    const src = nodeByEntity.get(e.metadata.name)
    ;(e.spec?.dependsOn || []).forEach((ref) => {
      const { name } = refTarget(ref)
      pushRelation(
        src,
        nodeByEntity.get(name) || (existingNodeIds.has(name) ? name : undefined),
        name,
        'depends_on',
        undefined,
        `${e.__file}#${e.kind}:${e.metadata.name}`,
      )
    })
    ;(e.spec?.consumesApis || []).forEach((api) => {
      const providerEntity = apiProvider.get(api)
      if (!providerEntity) {
        diff.unresolved.push({ ref: `api:${api}`, reason: 'consumesApis 指向的 API 没有提供方' })
        return
      }
      const apiEntity = entities.find((x) => x.kind === 'API' && x.metadata.name === api)
      const kind = /grpc/i.test(apiEntity?.spec?.type || '') ? 'rpc' : 'http'
      pushRelation(
        src,
        nodeByEntity.get(providerEntity.metadata.name),
        providerEntity.metadata.name,
        'calls',
        { kind },
        `${e.__file}#${e.kind}:${e.metadata.name}`,
      )
    })
  })

  return diff
}

function mergeInto(data, diff) {
  const out = JSON.parse(JSON.stringify(data))
  out.systems ??= []
  out.nodes ??= []
  out.relations ??= []

  diff.systems.forEach((s) => {
    const hit = out.systems.find((x) => x.id === s.id)
    if (!hit) out.systems.push(s)
    else Object.entries(s).forEach(([k, v]) => { if (v !== undefined && hit[k] === undefined) hit[k] = v })
  })
  diff.nodes.forEach((n) => {
    const hit = out.nodes.find((x) => x.id === n.id)
    if (!hit) out.nodes.push(n)
    else Object.entries(n).forEach(([k, v]) => { if (v !== undefined && hit[k] === undefined) hit[k] = v })
  })
  const triples = new Set(out.relations.map((r) => `${r.source}|${r.target}|${r.relationType}`))
  diff.relations.forEach((r) => {
    if (triples.has(`${r.source}|${r.target}|${r.relationType}`)) return
    triples.add(`${r.source}|${r.target}|${r.relationType}`)
    out.relations.push(r)
  })
  return out
}

function validateFile(file) {
  try {
    const out = execFileSync(
      process.execPath,
      ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'scripts/validate-topology.mjs'],
      { cwd: process.cwd(), env: { ...process.env, TOPOLOGY_DATA: file }, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    return { ok: true, output: out }
  } catch (e) {
    return { ok: false, output: `${e.stdout || ''}${e.stderr || ''}` }
  }
}

function runImport() {
  const inputs = [...allOpts('file'), ...allOpts('dir')]
  if (inputs.length === 0) {
    console.error('用法: node scripts/backstage.mjs import --file <catalog-info.yaml|目录> [--apply]')
    process.exit(2)
  }
  const data = JSON.parse(fs.readFileSync(dataFile(), 'utf-8'))
  const files = readYamlFiles(inputs)
  const entities = loadEntities(files)
  if (entities.length === 0) {
    console.error('没有解析到任何 Backstage 实体（需要 kind + metadata.name）')
    process.exit(1)
  }

  const diff = buildImport(entities, data)
  const newNodes = diff.nodes.filter((n) => !(data.nodes || []).some((x) => x.id === n.id))
  const newSystems = diff.systems.filter((s) => !(data.systems || []).some((x) => x.id === s.id))
  const existingTriples = new Set((data.relations || []).map((r) => `${r.source}|${r.target}|${r.relationType}`))
  const newRelations = diff.relations.filter((r) => !existingTriples.has(`${r.source}|${r.target}|${r.relationType}`))

  console.log(`数据源：${dataDisplay()}`)
  console.log(`解析 ${files.length} 个文件 / ${entities.length} 个实体`)
  console.log(
    `将新增：系统 ${newSystems.length} · 节点 ${newNodes.length} · 关系 ${newRelations.length}` +
      `（已存在则只补空字段；同三元组关系跳过）`,
  )
  if (diff.unresolved.length) {
    console.log(`\n⚠️  ${diff.unresolved.length} 条无法映射（不猜，留待人工）：`)
    diff.unresolved.slice(0, 20).forEach((u) => console.log(`   - ${u.ref}：${u.reason}`))
    if (diff.unresolved.length > 20) console.log(`   … 其余 ${diff.unresolved.length - 20} 条`)
  }

  if (!has('apply')) {
    console.log('\n（dry-run：未写入。确认后加 --apply）')
    return
  }
  if (dataIsDemo()) {
    console.error('\n拒绝写入：当前读取的是仓库自带示例数据。请用 TOPOLOGY_DATA 指向你的实例数据后再 --apply。')
    process.exit(1)
  }

  const merged = mergeInto(data, diff)
  const target = dataFile()
  const tmp = `${target}.import-${Date.now()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
  const check = validateFile(tmp)
  if (!check.ok) {
    fs.unlinkSync(tmp)
    console.error('\n导入后数据未通过校验，已中止（未写入）：')
    console.error(check.output.split('\n').filter((l) => /❌|错误|   - /.test(l)).slice(0, 30).join('\n'))
    process.exit(1)
  }
  fs.renameSync(tmp, target)
  console.log(`\n✅ 已写入 ${dataDisplay()}`)
  console.log('建议接着跑：npm run validate')
}

/* ============================== 入口 ============================== */

if (cmd === 'export') runExport()
else if (cmd === 'import') runImport()
else {
  console.error('用法:')
  console.error('  node scripts/backstage.mjs export --out <目录或 catalog-info.yaml>')
  console.error('  node scripts/backstage.mjs import --file <catalog-info.yaml|目录> [--apply]')
  process.exit(2)
}
