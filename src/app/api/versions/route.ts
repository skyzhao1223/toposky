import { NextResponse } from 'next/server'
import fs from 'fs'
import type { TopologyData, VersionMeta, VersionIndex } from '@/types'
import { requireDataFile, versionsDir } from '@/lib/dataPath'
import { InvalidVersionPathError, snapshotPath, versionIndexPath } from '@/lib/versionPath'

function ensureDir(): string {
  const directory = versionsDir()
  // Validate existing directory/index links before any mkdir or initialization.
  versionIndexPath(directory)
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true })
  const indexPath = versionIndexPath(directory)
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, JSON.stringify({ versions: [] }, null, 2), { encoding: 'utf-8', flag: 'wx' })
  }
  return indexPath
}

function readIndex(): VersionIndex {
  return JSON.parse(fs.readFileSync(ensureDir(), 'utf-8'))
}

function writeIndex(index: VersionIndex) {
  fs.writeFileSync(versionIndexPath(versionsDir()), JSON.stringify(index, null, 2), 'utf-8')
}

export async function GET() {
  try {
    const index = readIndex()
    return NextResponse.json(index)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: e instanceof InvalidVersionPathError ? 400 : 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { name, description } = await request.json()
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: '版本名称不能为空' }, { status: 400 })
    }

    const index = readIndex()
    const directory = versionsDir()

    const raw = fs.readFileSync(requireDataFile().file, 'utf-8')
    const data: TopologyData = JSON.parse(raw)
    const id = `v-${Date.now()}`
    snapshotPath(directory, id)
    const tmpPath = snapshotPath(directory, id, true)
    fs.writeFileSync(tmpPath, raw, { encoding: 'utf-8', flag: 'wx' })
    fs.renameSync(snapshotPath(directory, id, true), snapshotPath(directory, id))

    const meta: VersionMeta = {
      id,
      name,
      description: description || undefined,
      createdAt: new Date().toISOString(),
      nodeCount: data.nodes?.length || 0,
      relationCount: data.relations?.length || 0,
      size: Buffer.byteLength(raw, 'utf-8'),
    }

    index.versions.unshift(meta)
    writeIndex(index)

    return NextResponse.json({ success: true, version: meta })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: e instanceof InvalidVersionPathError ? 400 : 500 })
  }
}
