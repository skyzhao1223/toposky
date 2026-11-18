#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { pathToFileURL } from 'node:url'

export function assertHealthyTopology(data) {
  if (!data || !Array.isArray(data.nodes) || !data.nodes.length || !Array.isArray(data.relations)) {
    throw new Error('Topology response has no usable data')
  }
  const ids = new Set()
  for (const node of data.nodes) {
    if (!node || typeof node.id !== 'string' || !node.id.trim() || ids.has(node.id)) {
      throw new Error('Topology response contains invalid nodes')
    }
    ids.add(node.id)
  }
  const relationIds = new Set()
  for (const relation of data.relations) {
    if (!relation || typeof relation.id !== 'string' || !relation.id.trim() || relationIds.has(relation.id)
      || !ids.has(relation.source) || !ids.has(relation.target)) {
      throw new Error('Topology response contains invalid relations')
    }
    relationIds.add(relation.id)
  }
  return { nodes: ids.size, relations: relationIds.size }
}

export async function checkHealth({ url = `http://127.0.0.1:${process.env.PORT || '3000'}/api/topology`, fetcher = fetch, expectedDemo } = {}) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(4000), redirect: 'error' })
  if (!response.ok) throw new Error('Topology endpoint is unavailable')
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Topology response is not JSON')
  const data = await response.json()
  const counts = assertHealthyTopology(data)
  if (expectedDemo && !isDeepStrictEqual(data, expectedDemo)) throw new Error('Expected fictional demo data')
  return counts
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const expectedDemo = process.argv.includes('--expect-demo')
      ? JSON.parse(fs.readFileSync(new URL('../examples/demo/topology.json', import.meta.url), 'utf8'))
      : undefined
    const urlIndex = process.argv.indexOf('--url')
    const counts = await checkHealth({ expectedDemo, ...(urlIndex >= 0 ? { url: process.argv[urlIndex + 1] } : {}) })
    console.log(`Healthy topology: ${counts.nodes} nodes / ${counts.relations} relations`)
  } catch {
    // Never log raw errors: filesystem paths, topology contents and remote bodies are private.
    console.error('Topology content health check failed.')
    process.exitCode = 1
  }
}
