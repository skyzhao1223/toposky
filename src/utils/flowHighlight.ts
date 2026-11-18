import type { BusinessFlow, SystemRelation } from '@/types'

export function getFlowNodeIds(flow: BusinessFlow): string[] {
  return flow.steps.map((s) => s.nodeId)
}

export function getFlowRelationIds(
  flow: BusinessFlow,
  relations: SystemRelation[],
): string[] {
  const ids: string[] = []
  for (let i = 0; i < flow.steps.length - 1; i++) {
    const from = flow.steps[i].nodeId
    const to = flow.steps[i + 1].nodeId
    const match = relations.find(
      (r) =>
        (r.source === from && r.target === to) ||
        (r.source === to && r.target === from),
    )
    if (match) ids.push(match.id)
  }
  return ids
}

export function getFlowHighlight(
  flow: BusinessFlow,
  relations: SystemRelation[],
): { nodeIds: string[]; relationIds: string[] } {
  return {
    nodeIds: getFlowNodeIds(flow),
    relationIds: getFlowRelationIds(flow, relations),
  }
}
