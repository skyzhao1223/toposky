/**
 * 词表数据化测试：业务域 / 业务线主责域 / 流程宿主引擎。
 *
 * 这些词表以前写在代码常量里，开源/私有化部署时必须改代码。
 * 这里锁住三条契约：
 *   1. 数据没声明 → 用内置默认（老数据零迁移）；
 *   2. 数据声明了 → 数据即权威（不与默认混合）；
 *   3. 解析/映射函数在两种模式下都给出稳定结果。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const T = await import(pathToFileURL(path.join(ROOT, 'src/types/index.ts')).href)

test('业务域：未声明 domains 时回退内置默认 8 个', () => {
  const maps = T.buildDomainMaps()
  assert.equal(maps.domains.length, 8)
  assert.equal(maps.order.length, 8)
  assert.equal(maps.labels.fin, '财务管理')
  assert.deepEqual(maps.order, T.DOMAIN_REGISTRY.map((d) => d.id))
})

test('业务域：数据声明后即权威词表（不与默认混合）', () => {
  const maps = T.buildDomainMaps({
    domains: [
      { id: 'collab', name: '协同办公', color: '#1677ff' },
      { id: 'expense', name: '费用与差旅', color: '#52c41a' },
    ],
  })
  assert.deepEqual(maps.order, ['collab', 'expense'])
  assert.equal(maps.labels.collab, '协同办公')
  assert.equal(maps.colors.expense, '#52c41a')
  assert.equal(maps.labels.fin, undefined)
  assert.equal(maps.domains.length, 2)
})

test('业务域：解析函数支持别名，但别名必须存在于词表', () => {
  assert.equal(T.resolveDomainId('finance'), 'fin') // 内置别名
  assert.equal(T.resolveDomainId('nope'), undefined)
  assert.equal(T.resolveDomainId('finance', [{ id: 'collab' }]), undefined) // 自定义词表里没有 fin
  assert.equal(T.resolveDomainId('collab', [{ id: 'collab' }]), 'collab')
})

test('业务域：标签/颜色在缺词条时给保守兜底', () => {
  assert.equal(T.domainLabel('nope'), '未分类')
  assert.equal(T.domainColor('nope'), '#8c8c8c')
  assert.equal(T.processDomainColor('nope'), '#6b7280')
  assert.equal(T.processDomainColor('collab', { collab: '#1677ff' }), '#1677ff')
  assert.equal(T.domainLabel('collab', { collab: '协同办公' }), '协同办公')
})

test('业务线 → 业务域：数据可用 businessLines[].domain 覆盖内置映射', () => {
  const base = T.businessLineDomainMap()
  assert.equal(base['oa-platform'], 'oa')

  const custom = T.businessLineDomainMap({
    businessLines: [{ id: 'oa-platform', name: '协同', color: '#1677ff', domain: 'collab' }],
  })
  assert.equal(custom['oa-platform'], 'collab')
  assert.equal(custom.travel, 'travel') // 未覆盖的仍走内置兜底
})

test('nodePrimaryDomain：优先业务线声明的域，其次由业务流派生', () => {
  const data = {
    domains: [{ id: 'collab', name: '协同', color: '#1677ff' }],
    businessLines: [{ id: 'oa-platform', name: '协同', color: '#1677ff', domain: 'collab' }],
    businessFlows: [
      { id: 'f1', name: '流程', description: '', domain: 'collab', steps: [{ nodeId: 'n1', label: 'a' }] },
    ],
    processCatalog: { domains: [], dependencies: [] },
  }
  assert.equal(T.nodePrimaryDomain({ id: 'n1', businessLine: 'oa-platform' }, data), 'collab')
  assert.equal(T.nodePrimaryDomain({ id: 'n1' }, data), 'collab')
  assert.equal(T.nodePrimaryDomain({ id: 'n1' }, { ...data, businessFlows: [], processCatalog: { domains: [], dependencies: [] } }), undefined)
})

test('宿主引擎：默认词表与自定义词表', () => {
  const def = T.buildProcessHostMaps()
  assert.deepEqual(def.hosts.map((h) => h.id), ['engine-a', 'engine-b', 'hybrid'])
  assert.equal(def.labels.hybrid, '混合引擎')

  const custom = T.buildProcessHostMaps({
    processHosts: [{ id: 'bpmn', name: 'BPMN 引擎', color: '#1677ff' }],
  })
  assert.deepEqual(custom.hosts.map((h) => h.id), ['bpmn'])
  assert.equal(custom.labels.bpmn, 'BPMN 引擎')
  assert.equal(custom.colors.bpmn, '#1677ff')
  assert.equal(custom.labels['engine-a'], undefined)
})

test('业务线词表：数据覆盖标签与颜色，未覆盖时用内置', () => {
  const maps = T.buildBusinessLineMaps({
    businessLines: [{ id: 'oa-platform', name: '协同平台', color: '#000000' }],
  })
  assert.equal(maps.labels['oa-platform'], '协同平台')
  assert.equal(maps.colors['oa-platform'], '#000000')
  assert.equal(maps.labels.infra, '基础设施')
})
