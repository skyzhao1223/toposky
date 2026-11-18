#!/usr/bin/env node
/**
 * 脚本侧的数据位置解析 —— 与 src/lib/dataPath.ts 同一套口径。
 *
 * 脚本（.mjs）不重复实现路径规则，统一从这里拿：
 *   dataFile()    实际读取的数据文件（绝对路径）
 *   dataDisplay() 展示用相对路径
 *   dataIsDemo()  当前是否在读仓库自带的示例数据
 *   readTopology() 读并解析数据
 *
 * Node 原生可直接 import .ts（类型剥离），因此与运行时共用一份实现，避免两套漂移。
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const mod = await import(pathToFileURL(path.join(process.cwd(), 'src/lib/dataPath.ts')).href)

export const { resolveDataFile, requireDataFile, instanceDataFile, demoDataFile, storeDir, versionsDir } = mod

export function dataFile() {
  return requireDataFile().file
}

export function dataDisplay() {
  return requireDataFile().display
}

export function dataIsDemo() {
  return requireDataFile().isDemo
}

export function readTopology() {
  return JSON.parse(fs.readFileSync(dataFile(), 'utf-8'))
}

/** 在脚本开头打印数据源，回答「这次校验/报告读的到底是哪份数据」 */
export function printDataBanner(label = '数据源') {
  const loc = requireDataFile()
  console.log(`ℹ️  ${label}：${loc.display}${loc.isDemo ? '（示例数据，非真实实例）' : ''}`)
  return loc
}
