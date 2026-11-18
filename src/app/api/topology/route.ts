import { NextResponse } from 'next/server'
import fs from 'fs'
import { TopologyData } from '@/types'
import { validateTopology } from '@/lib/validateTopology'
import { commitData, currentVersion } from '@/lib/gitStore'
import { ensureWritableDataFile, requireDataFile } from '@/lib/dataPath'

export const VERSION_HEADER = 'X-Topology-Version'
export const SOURCE_HEADER = 'X-Topology-Source'
export const DEMO_HEADER = 'X-Topology-Demo'

function readData(): TopologyData {
  const raw = fs.readFileSync(requireDataFile().file, 'utf-8')
  return JSON.parse(raw)
}

function writeData(data: TopologyData) {
  fs.writeFileSync(ensureWritableDataFile(), JSON.stringify(data, null, 2), 'utf-8')
}

export async function GET() {
  try {
    const loc = requireDataFile()
    const data = readData()
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.relations) || !validateTopology(data).ok) {
      throw new Error('Invalid topology data')
    }
    const version = currentVersion()
    const res = NextResponse.json(data)
    if (version) res.headers.set(VERSION_HEADER, version)
    res.headers.set(SOURCE_HEADER, loc.display)
    if (loc.isDemo) res.headers.set(DEMO_HEADER, '1')
    return res
  } catch {
    // Do not turn a missing/corrupt instance into a healthy empty graph, or disclose filesystem paths.
    return NextResponse.json(
      { error: 'Topology data is unavailable. Check the instance data configuration.', code: 'TOPOLOGY_DATA_UNAVAILABLE' },
      { status: 503 },
    )
  }
}

interface PutBody {
  data?: TopologyData
  author?: string
  email?: string
  message?: string
  baseVersion?: string
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as TopologyData | PutBody
    // 兼容旧格式（直接是数据）与新格式（带 author/message/baseVersion）
    const legacy = !body || Array.isArray((body as TopologyData).nodes)
    const data: TopologyData = legacy ? (body as TopologyData) : (body as PutBody).data!
    const author = (!legacy && (body as PutBody).author) || '平台维护者'
    const email = (!legacy && (body as PutBody).email) || 'platform@local'
    const message = (!legacy && (body as PutBody).message) || '更新元数据'
    const baseVersion = !legacy ? (body as PutBody).baseVersion : undefined

    if (!data) {
      return NextResponse.json({ success: false, error: '缺少数据' }, { status: 400 })
    }

    // 1) schema / 引用完整性校验
    const result = validateTopology(data)
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: '数据校验未通过', errors: result.errors.slice(0, 50) },
        { status: 422 },
      )
    }

    // 2) 乐观锁：客户端持有的版本与当前不一致 → 冲突
    const ver = currentVersion()
    if (baseVersion && ver && baseVersion !== ver) {
      return NextResponse.json(
        { success: false, conflict: true, error: '数据已被他人修改，请刷新后重试', version: ver },
        { status: 409 },
      )
    }

    // 3) 落盘 + 提交本地 git（保存即一次 commit，形成审计历史）
    writeData(data)
    const commit = commitData(author, email, message)

    return NextResponse.json({
      success: true,
      warnings: result.warnings,
      version: commit.version,
      committed: commit.committed,
      commitSkipped: commit.skipped,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ success: false, error: msg }, { status: 400 })
  }
}
