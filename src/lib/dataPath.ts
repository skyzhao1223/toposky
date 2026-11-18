/**
 * 拓扑数据位置解析 —— **数据与代码分离的唯一入口**。
 *
 * 代码仓库只带「示例数据」；真实实例数据放在仓库外（或被 gitignore 的 data/ 目录），
 * 由环境变量或目录约定注入。所有服务端代码（API 路由、脚本、git 审计）都必须
 * 通过本模块拿路径，不允许再出现硬编码的 `src/data/topology.json`。
 *
 * 读取优先级（先命中先用）：
 *   1. `TOPOLOGY_DATA`            显式指定数据文件（相对进程 cwd 或绝对路径）
 *   2. `TOPOLOGY_DATA_DIR/topology.json`
 *   3. `./data/topology.json`     默认实例目录（通常不入库）
 *   4. `./src/data/topology.json` 旧布局，仅兼容读取（已废弃）
 *   5. `./examples/demo/topology.json` 随仓库分发的示例数据（只读演示）
 *
 * 写入（保存/版本快照）永远落在**实例路径**：`TOPOLOGY_DATA` → `TOPOLOGY_DATA_DIR` → `./data/`。
 * 首次保存时若实例文件不存在，会自动把示例数据复制过去，保证「开箱即用、改一下就落盘」。
 *
 * 版本快照目录固定在实例目录下的 `versions/`（与数据文件同源，便于一起备份/私有化）。
 *
 * 只依赖 node:fs / node:path，因此可被 Next 服务端与 Node 原生脚本（.mjs）共同 import。
 */
import fs from 'node:fs'
import path from 'node:path'

/** 进程根目录；测试或多实例部署可用 TOPOLOGY_ROOT 覆盖 */
export function repoRoot(): string {
  const root = process.env.TOPOLOGY_ROOT?.trim()
  return root ? path.resolve(root) : process.cwd()
}

/** 随仓库分发的示例数据（只读的兜底） */
export const DEMO_REL = 'examples/demo/topology.json'

function abs(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(repoRoot(), p)
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

/** 实例数据文件（**写入目标**）：显式 env → data 目录 → ./data/topology.json */
export function instanceDataFile(): string {
  const explicit = process.env.TOPOLOGY_DATA?.trim()
  if (explicit) return abs(explicit)
  const dir = process.env.TOPOLOGY_DATA_DIR?.trim()
  if (dir) return path.join(abs(dir), 'topology.json')
  return path.join(repoRoot(), 'data', 'topology.json')
}

/** 实例目录（版本快照、备份都放这里） */
export function storeDir(): string {
  const dir = process.env.TOPOLOGY_DATA_DIR?.trim()
  if (dir) return abs(dir)
  const explicit = process.env.TOPOLOGY_DATA?.trim()
  if (explicit) return path.dirname(abs(explicit))
  return path.join(repoRoot(), 'data')
}

export function versionsDir(): string {
  return path.join(storeDir(), 'versions')
}

export function demoDataFile(): string {
  return path.join(repoRoot(), DEMO_REL)
}

export type DataSource = 'env' | 'data-dir' | 'demo'

export interface DataLocation {
  /** 实际读取的文件 */
  file: string
  /** 是否示例数据（只读演示，说明还没接入自己的数据） */
  isDemo: boolean
  /** 来源分类，用于提示信息 */
  source: DataSource
  /** 展示用相对路径 */
  display: string
}

function display(p: string): string {
  const rel = path.relative(repoRoot(), p)
  return rel && !rel.startsWith('..') ? rel.split(path.sep).join('/') : p
}

/**
 * 解析实际读取的数据文件。
 * 实例文件不存在时回退示例数据；两者都没有则返回 null（调用方给出可读报错）。
 */
export function resolveDataFile(): DataLocation | null {
  const instance = instanceDataFile()
  if (isFile(instance)) {
    // 显式指向仓库自带的示例文件时，仍应标记为 demo（避免把它当实例数据写回）
    const isDemo = path.resolve(instance) === path.resolve(demoDataFile())
    return {
      file: instance,
      isDemo,
      source: isDemo ? 'demo' : process.env.TOPOLOGY_DATA || process.env.TOPOLOGY_DATA_DIR ? 'env' : 'data-dir',
      display: display(instance),
    }
  }
  // 显式指定了数据位置却不存在：直接报错，不静默回退示例数据（否则「以为是真实数据」的误判无解）
  if (process.env.TOPOLOGY_DATA?.trim() || process.env.TOPOLOGY_DATA_DIR?.trim()) return null
  // 旧布局兼容：仓库早期把数据放在 src/data 下
  const legacy = path.join(repoRoot(), 'src', 'data', 'topology.json')
  if (isFile(legacy)) {
    return { file: legacy, isDemo: false, source: 'data-dir', display: display(legacy) }
  }
  const demo = demoDataFile()
  if (isFile(demo)) {
    return { file: demo, isDemo: true, source: 'demo', display: display(demo) }
  }
  return null
}

/** 读取用：拿不到就抛带指引的错误 */
export function requireDataFile(): DataLocation {
  const loc = resolveDataFile()
  if (!loc) {
    throw new Error(
      `未找到拓扑数据：请设置 TOPOLOGY_DATA 指向数据文件，或把数据放到 ${display(instanceDataFile())}`,
    )
  }
  return loc
}

/** 写入用：确保实例文件存在（不存在时从示例数据初始化），并返回路径 */
export function ensureWritableDataFile(): string {
  const target = instanceDataFile()
  if (isFile(target)) return target
  const demo = demoDataFile()
  if (isFile(demo)) {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(demo, target)
    return target
  }
  throw new Error(`数据文件不存在，且没有可复制的示例数据：${target}`)
}
