import { NextResponse } from 'next/server'
import fs from 'fs'
import type { TopologyData, VersionDiff } from '@/types'
import { requireDataFile, versionsDir } from '@/lib/dataPath'
import { assertVersionId, InvalidVersionPathError, snapshotPath } from '@/lib/versionPath'

function loadVersion(id: string): TopologyData {
  if (id === 'current') {
    return JSON.parse(fs.readFileSync(requireDataFile().file, 'utf-8'))
  }
  const p = snapshotPath(versionsDir(), id)
  if (!fs.existsSync(p)) throw new Error(`版本 ${id} 不存在`)
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}

function diffFields(a: Record<string, unknown>, b: Record<string, unknown>, skip: string[]): string[] {
  const changes: string[] = []
  const allKeys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]))
  for (const key of allKeys) {
    if (skip.includes(key)) continue
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
      changes.push(key)
    }
  }
  return changes
}

function computeDiff(from: TopologyData, to: TopologyData): VersionDiff {
  const fromNodes = new Map(from.nodes.map((n) => [n.id, n]))
  const toNodes = new Map(to.nodes.map((n) => [n.id, n]))

  const addedNodes = to.nodes
    .filter((n) => !fromNodes.has(n.id))
    .map((n) => ({ id: n.id, name: n.name }))
  const removedNodes = from.nodes
    .filter((n) => !toNodes.has(n.id))
    .map((n) => ({ id: n.id, name: n.name }))
  const modifiedNodes = to.nodes
    .filter((n) => fromNodes.has(n.id))
    .map((n) => {
      const old = fromNodes.get(n.id)!
      const changes = diffFields(old as unknown as Record<string, unknown>, n as unknown as Record<string, unknown>, ['id'])
      return changes.length > 0 ? { id: n.id, name: n.name, changes } : null
    })
    .filter(Boolean) as VersionDiff['modifiedNodes']

  const fromRels = new Map(from.relations.map((r) => [r.id, r]))
  const toRels = new Map(to.relations.map((r) => [r.id, r]))

  const addedRelations = to.relations
    .filter((r) => !fromRels.has(r.id))
    .map((r) => ({ id: r.id, label: r.label, source: r.source, target: r.target }))
  const removedRelations = from.relations
    .filter((r) => !toRels.has(r.id))
    .map((r) => ({ id: r.id, label: r.label, source: r.source, target: r.target }))
  const modifiedRelations = to.relations
    .filter((r) => fromRels.has(r.id))
    .map((r) => {
      const old = fromRels.get(r.id)!
      const changes = diffFields(old as unknown as Record<string, unknown>, r as unknown as Record<string, unknown>, ['id'])
      return changes.length > 0 ? { id: r.id, changes } : null
    })
    .filter(Boolean) as VersionDiff['modifiedRelations']

  const parts: string[] = []
  if (addedNodes.length) parts.push(`新增 ${addedNodes.length} 个节点`)
  if (removedNodes.length) parts.push(`删除 ${removedNodes.length} 个节点`)
  if (modifiedNodes.length) parts.push(`修改 ${modifiedNodes.length} 个节点`)
  if (addedRelations.length) parts.push(`新增 ${addedRelations.length} 条关系`)
  if (removedRelations.length) parts.push(`删除 ${removedRelations.length} 条关系`)
  if (modifiedRelations.length) parts.push(`修改 ${modifiedRelations.length} 条关系`)
  const summary = parts.length > 0 ? parts.join('，') : '无变更'

  return {
    addedNodes, removedNodes, modifiedNodes,
    addedRelations, removedRelations, modifiedRelations,
    summary,
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to') || 'current'

    if (!from) {
      return NextResponse.json({ error: '缺少 from 参数' }, { status: 400 })
    }

    // Validate both inputs before any read, including when one is 'current'.
    assertVersionId(from, true)
    assertVersionId(to, true)
    const fromData = loadVersion(from)
    const toData = loadVersion(to)
    const diff = computeDiff(fromData, toData)

    return NextResponse.json(diff)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: e instanceof InvalidVersionPathError ? 400 : 500 })
  }
}
