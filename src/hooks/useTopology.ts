'use client'

import { useEffect, useSyncExternalStore } from 'react'
import type { TopologyData } from '@/types'
import {
  EMPTY_TOPOLOGY,
  getTopologyError,
  getTopologyServerSnapshot,
  getTopologySnapshot,
  loadTopology,
  subscribeTopology,
} from '@/services/topology'

/**
 * 订阅共享的拓扑数据。首次挂载时按需加载，之后跨页面复用缓存。
 * data 始终有值（加载中为空数据），用 loading 判断。
 */
export function useTopology(): {
  data: TopologyData
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const snapshot = useSyncExternalStore(subscribeTopology, getTopologySnapshot, getTopologyServerSnapshot)

  useEffect(() => {
    if (!snapshot) loadTopology().catch(() => {})
  }, [snapshot])

  return {
    data: snapshot || EMPTY_TOPOLOGY,
    loading: !snapshot,
    error: getTopologyError(),
    refresh: () => {
      loadTopology(true).catch(() => {})
    },
  }
}
