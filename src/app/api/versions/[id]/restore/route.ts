import { NextResponse } from 'next/server'
import fs from 'fs'
import type { TopologyData, VersionMeta, VersionIndex } from '@/types'
import { ensureWritableDataFile, versionsDir } from '@/lib/dataPath'
import { InvalidVersionPathError, snapshotPath, versionIndexPath } from '@/lib/versionPath'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const directory = versionsDir()
    const file = snapshotPath(directory, id)
    if (!fs.existsSync(file)) {
      return NextResponse.json({ error: '版本不存在' }, { status: 404 })
    }
    const indexPath = versionIndexPath(directory)
    const restoreRaw = fs.readFileSync(file, 'utf-8')
    const restoredData: TopologyData = JSON.parse(restoreRaw)

    const DATA_PATH = ensureWritableDataFile()
    const currentRaw = fs.readFileSync(DATA_PATH, 'utf-8')
    const currentData: TopologyData = JSON.parse(currentRaw)
    const backupId = `v-${Date.now()}`
    snapshotPath(directory, backupId)
    const tmpBackup = snapshotPath(directory, backupId, true)
    fs.writeFileSync(tmpBackup, currentRaw, { encoding: 'utf-8', flag: 'wx' })
    fs.renameSync(snapshotPath(directory, backupId, true), snapshotPath(directory, backupId))

    const backupMeta: VersionMeta = {
      id: backupId,
      name: '回滚前自动保存',
      description: `回滚到「${id}」前的自动备份`,
      createdAt: new Date().toISOString(),
      nodeCount: currentData.nodes?.length || 0,
      relationCount: currentData.relations?.length || 0,
      size: Buffer.byteLength(currentRaw, 'utf-8'),
    }

    const index: VersionIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    index.versions.unshift(backupMeta)
    fs.writeFileSync(versionIndexPath(directory), JSON.stringify(index, null, 2), 'utf-8')
    const tmpData = DATA_PATH + '.tmp'
    fs.writeFileSync(tmpData, restoreRaw, 'utf-8')
    fs.renameSync(tmpData, DATA_PATH)

    return NextResponse.json({
      success: true,
      data: restoredData,
      backupVersion: backupMeta,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: e instanceof InvalidVersionPathError ? 400 : 500 })
  }
}
