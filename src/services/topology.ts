import type { TopologyData } from '@/types'
import { DEMO_MODE } from '@/lib/demoMode'

/**
 * 拓扑数据共享层（单例缓存 + 订阅）。
 * - 多个页面共用同一份数据，避免各自重复拉取全量 JSON
 * - 并发请求去重；保存后写回缓存并通知订阅者
 * - 用 useTopology() 消费（见 src/hooks/useTopology.ts）
 */

const EMPTY: TopologyData = { nodes: [], relations: [] }

let cache: TopologyData | null = null
let inflight: Promise<TopologyData> | null = null
let lastError: string | null = null
let version: string | null = null
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

export function subscribeTopology(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getTopologySnapshot(): TopologyData | null {
  return cache
}

export function getTopologyServerSnapshot(): TopologyData | null {
  return null
}

export function getTopologyError(): string | null {
  return lastError
}

/** 当前数据版本（本地 git commit hash；乐观锁用） */
export function getTopologyVersion(): string | null {
  return version
}

export const EMPTY_TOPOLOGY = EMPTY

/** 加载拓扑数据（默认走缓存；force=true 强制刷新） */
export async function loadTopology(force = false): Promise<TopologyData> {
  if (cache && !force) return cache
  if (DEMO_MODE) {
    // 静态演示：数据随构建打包，不请求 /api/topology
    const mod = (await import('../../examples/demo/topology.json')) as unknown as
      | { default?: TopologyData }
      | TopologyData
    const d = ((mod as { default?: TopologyData }).default ?? mod) as TopologyData
    cache = d
    lastError = null
    emit()
    return d
  }
  if (inflight && !force) return inflight
  inflight = fetch('/api/topology')
    .then((res) => {
      if (!res.ok) throw new Error(`加载拓扑数据失败: ${res.status}`)
      const v = res.headers.get('X-Topology-Version')
      if (v) version = v
      return res.json() as Promise<TopologyData>
    })
    .then((d) => {
      cache = d
      lastError = null
      inflight = null
      emit()
      return d
    })
    .catch((e: unknown) => {
      inflight = null
      lastError = e instanceof Error ? e.message : String(e)
      emit()
      throw e
    })
  return inflight
}

/** 直接写入缓存（保存成功后调用，通知所有订阅页刷新） */
export function setTopology(data: TopologyData) {
  cache = data
  lastError = null
  emit()
}

/** 清空缓存，下次访问重新拉取 */
export function invalidateTopology() {
  cache = null
  inflight = null
  emit()
}

/** 兼容旧调用方 */
export async function fetchTopology(force = false): Promise<TopologyData> {
  return loadTopology(force)
}

export interface SaveResult {
  success: boolean
  error?: string
  errors?: string[]
  warnings?: string[]
  conflict?: boolean
  version?: string
  committed?: boolean
  /** 未生成 git 提交时的原因（数据与代码分离模式/未纳入仓库） */
  commitSkipped?: string
}

export interface SaveOptions {
  author?: string
  email?: string
  message?: string
}

export async function saveTopology(data: TopologyData, opts?: SaveOptions): Promise<SaveResult> {
  if (DEMO_MODE) {
    return { success: false, error: '演示模式为只读：请在本地运行 npm run dev 后编辑。' }
  }
  const res = await fetch('/api/topology', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data,
      author: opts?.author,
      email: opts?.email,
      message: opts?.message,
      baseVersion: version,
    }),
  })
  const json = (await res.json()) as SaveResult
  if (json.success) {
    setTopology(data)
    if (json.version) version = json.version
  }
  return json
}
