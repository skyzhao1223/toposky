import { NextResponse } from 'next/server'
import { dataHistory, isGitRepo } from '@/lib/gitStore'

/** 数据文件的 git 提交审计历史 */
export async function GET() {
  try {
    return NextResponse.json({
      enabled: isGitRepo(),
      history: dataHistory(50),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ enabled: false, history: [], error: msg })
  }
}
