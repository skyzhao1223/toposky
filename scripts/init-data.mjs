#!/usr/bin/env node
/**
 * 用示例数据初始化实例数据目录。
 *
 *   npm run data:init
 *
 * 为什么要它：数据与代码分离后，仓库里只有示例数据，真实数据在 `data/`（默认不入库）。
 * 第一次部署时把示例数据复制一份过去，界面就能直接跑；已有数据时**绝不覆盖**。
 */
import fs from 'node:fs'
import path from 'node:path'
import { demoDataFile, instanceDataFile, resolveDataFile } from './lib/data-file.mjs'

const target = instanceDataFile()

if (fs.existsSync(target)) {
  const loc = resolveDataFile()
  console.log(`实例数据已存在，未做任何改动：${target}`)
  if (loc) console.log(`当前读取：${loc.display}${loc.isDemo ? '（示例数据）' : ''}`)
  process.exit(0)
}

if (!fs.existsSync(demoDataFile())) {
  console.error(`找不到示例数据：${demoDataFile()}`)
  process.exit(1)
}

fs.mkdirSync(path.dirname(target), { recursive: true })
fs.copyFileSync(demoDataFile(), target)

console.log(`已初始化实例数据：${target}`)
console.log('提示：data/ 默认被 .gitignore 忽略；若需要「保存即提交」的审计历史，可在 data/ 内单独 git init 成私有仓库。')
