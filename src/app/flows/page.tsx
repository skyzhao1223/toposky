'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/** 旧入口 /flows 的兼容跳转（保留 flow 参数）。客户端跳转，静态导出也能工作。 */
function Redirector() {
  const router = useRouter()
  const params = useSearchParams()
  const flow = params.get('flow')
  useEffect(() => {
    router.replace(`/processes?tab=flows${flow ? `&flow=${flow}` : ''}`)
  }, [router, flow])
  return null
}

export default function FlowsPage() {
  return (
    <Suspense fallback={null}>
      <Redirector />
    </Suspense>
  )
}
