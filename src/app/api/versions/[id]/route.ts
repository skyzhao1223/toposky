import { NextResponse } from 'next/server'
import fs from 'fs'
import type { VersionIndex } from '@/types'
import { versionsDir } from '@/lib/dataPath'
import { InvalidVersionPathError, snapshotPath, versionIndexPath } from '@/lib/versionPath'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const file = snapshotPath(versionsDir(), id)
    if (!fs.existsSync(file)) {
      return NextResponse.json({ error: '版本不存在' }, { status: 404 })
    }
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return NextResponse.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: e instanceof InvalidVersionPathError ? 400 : 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const file = snapshotPath(versionsDir(), id)

    const indexPath = versionIndexPath(versionsDir())
    const index: VersionIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    const exists = index.versions.some((v) => v.id === id)
    if (!exists) {
      return NextResponse.json({ error: '版本不存在' }, { status: 404 })
    }

    index.versions = index.versions.filter((v) => v.id !== id)
    fs.writeFileSync(versionIndexPath(versionsDir()), JSON.stringify(index, null, 2), 'utf-8')

    if (fs.existsSync(file)) fs.unlinkSync(snapshotPath(versionsDir(), id))

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: e instanceof InvalidVersionPathError ? 400 : 500 })
  }
}
