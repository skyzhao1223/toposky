import { NextResponse } from 'next/server'
import fs from 'fs'
import type { TopologyData } from '@/types'
import {
  IMPACT_CAVEATS,
  collectContracts,
  collectOwners,
  collectRepos,
  computeImpact,
  nodeRef,
  normalizeDepth,
  summarizeImpact,
} from '@/lib/impact'

import { requireDataFile } from '@/lib/dataPath'

function readData(): TopologyData {
  return JSON.parse(fs.readFileSync(requireDataFile().file, 'utf-8')) as TopologyData
}

/**
 * GET /api/impact?id=<系统id>&depth=<1-3>
 *
 * 元数据图谱级影响面：受影响集合 = 上游 ∪ 下游 ∪ 自身（深度受限），
 * 并返回受影响的业务流 / 流程 / 代码仓库 / 负责人 / 直接依赖契约。
 *
 * 计算口径与 /impact 页面共用 src/lib/impact.ts，避免两处漂移。
 * 供内部调用与后续 MCP 工具（topology-mcp）使用。
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const id = (url.searchParams.get('id') || '').trim()
    if (!id) {
      return NextResponse.json(
        { error: '缺少参数 id（系统节点 id），例：/api/impact?id=mysql&depth=3' },
        { status: 400 },
      )
    }

    const data = readData()
    if (!data.nodes.some((n) => n.id === id)) {
      return NextResponse.json({ error: `系统不存在：${id}` }, { status: 404 })
    }

    const depth = normalizeDepth(url.searchParams.get('depth'))
    const analysis = computeImpact(data, id, depth)

    return NextResponse.json({
      level: 'metadata',
      generatedAt: new Date().toISOString(),
      focus: nodeRef(data, id),
      depth: analysis.depth,
      summary: summarizeImpact(data, analysis),
      upstream: analysis.up.map((u) => ({ ...nodeRef(data, u.id), distance: u.depth, via: u.via })),
      downstream: analysis.down.map((u) => ({ ...nodeRef(data, u.id), distance: u.depth, via: u.via })),
      businessFlows: analysis.affectedFlows.map((f) => ({
        id: f.id,
        name: f.name,
        criticality: f.criticality,
        domain: f.domain,
        owner: f.owner,
        hitSteps: f.steps
          .filter((s) => analysis.impactIds.has(s.nodeId))
          .map((s) => ({ id: s.nodeId, name: nodeRef(data, s.nodeId).name, label: s.label })),
      })),
      processes: analysis.affectedProcesses,
      repos: collectRepos(data, analysis.impactIds),
      owners: collectOwners(data, analysis.impactIds),
      contracts: collectContracts(data, id),
      caveats: IMPACT_CAVEATS,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
