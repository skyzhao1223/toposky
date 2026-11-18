#!/usr/bin/env node
/**
 * 打印当前数据源与存储位置 —— 回答「这个实例到底在读哪份数据」。
 *
 *   npm run data:status
 *
 * 常见误判：以为在读真实数据，其实回退到了示例数据（反之亦然）。
 */
import fs from 'node:fs'
import { dataIsDemo, instanceDataFile, resolveDataFile, storeDir, versionsDir } from './lib/data-file.mjs'

const loc = resolveDataFile()
const versionFile = versionsDir()

console.log('数据与代码分离状态')
console.log('──────────────────')
if (!loc) {
  console.log('读取：❌ 未找到任何数据文件（既没有 data/topology.json，也没有示例数据）')
} else {
  console.log(`读取：${loc.display}`)
  console.log(`类型：${loc.isDemo ? '示例数据（只读演示，改一下保存时会自动复制到实例目录）' : '实例数据'}`)
  console.log(`来源：${loc.source === 'env' ? '环境变量 TOPOLOGY_DATA / TOPOLOGY_DATA_DIR' : loc.source === 'demo' ? '仓库内置示例' : '默认实例目录'}`)
  const bytes = fs.statSync(loc.file).size
  console.log(`大小：${(bytes / 1024).toFixed(1)} KB`)
}
console.log(`写入：${instanceDataFile()}`)
console.log(`存储目录：${storeDir()}`)
console.log(`版本快照：${versionFile}${fs.existsSync(versionFile) ? '' : '（尚未创建）'}`)
console.log(`是否示例：${dataIsDemo() ? '是' : '否'}`)
