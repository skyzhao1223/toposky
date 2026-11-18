'use client'

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'topology-author'

export interface AuthorInfo {
  name: string
  email: string
}

const DEFAULT_AUTHOR: AuthorInfo = { name: '', email: '' }

function readStored(): AuthorInfo {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_AUTHOR
    const parsed = JSON.parse(raw) as Partial<AuthorInfo>
    return { name: parsed.name || '', email: parsed.email || '' }
  } catch {
    return DEFAULT_AUTHOR
  }
}

/**
 * 维护者身份（localStorage 持久化）。
 * 保存时作为 git 提交作者传给 /api/topology，用于审计。
 */
export function useAuthor(): [AuthorInfo, (patch: Partial<AuthorInfo>) => void] {
  const [author, setAuthor] = useState<AuthorInfo>(DEFAULT_AUTHOR)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载后从 localStorage 水合，避免 SSR 不一致
    setAuthor(readStored())
  }, [])

  const update = useCallback((patch: Partial<AuthorInfo>) => {
    setAuthor((prev) => {
      const next = { ...prev, ...patch }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // localStorage 不可用时仅保留内存态
      }
      return next
    })
  }, [])

  return [author, update]
}
