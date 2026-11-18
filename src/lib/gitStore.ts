import { execFileSync } from 'child_process'
import fs from 'node:fs'
import path from 'node:path'
import { instanceDataFile } from './dataPath'

/**
 * 数据文件的 git 审计（保存即一次 commit）。
 *
 * 数据与代码分离后，数据文件可能：
 *   - 在另一个（私有）仓库里：`data/` 自己 `git init`，此时审计提交到该仓库；
 *   - 被主仓库 .gitignore 忽略：审计自动降级（保存成功，但不产生提交），
 *     并在保存结果里说明原因，避免「以为提交了其实没提交」；
 *   - 就在当前仓库（示例数据 / 单仓部署）：行为与以前一致。
 */

interface DataRepo {
  /** 数据文件所在 git 仓库根目录 */
  root: string
  /** 数据文件相对仓库根的路径（POSIX 分隔符） */
  rel: string
}

function run(args: string[], cwd: string, allowFail = false): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
  } catch (e) {
    if (allowFail) return null
    throw e
  }
}

/** 向上找数据文件所属的 git 仓库（数据目录可以独立成仓） */
function dataRepo(): DataRepo | null {
  let dir = path.dirname(instanceDataFile())
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      const rel = path.relative(dir, instanceDataFile()).split(path.sep).join('/')
      return { root: dir, rel }
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** 数据文件是否被 git 忽略（忽略时无法审计，应显式降级而不是报错） */
function isIgnored(repo: DataRepo): boolean {
  // check-ignore 命中时退出码 0
  const out = run(['check-ignore', '--quiet', '--', repo.rel], repo.root, true)
  if (out !== null) return true
  // 命令失败（权限/老版本）时按「未忽略」处理，后续 add 会自行报错
  return false
}

export function isGitRepo(): boolean {
  const repo = dataRepo()
  return !!repo && !isIgnored(repo)
}

/** 数据文件最后一次提交的 hash（作为乐观锁版本号）；不可审计时返回 null */
export function currentVersion(): string | null {
  const repo = dataRepo()
  if (!repo || isIgnored(repo)) return null
  return run(['log', '-1', '--format=%H', '--', repo.rel], repo.root, true)
}

export interface CommitResult {
  version: string | null
  committed: boolean
  /** 未提交时的可读原因（未纳入 git / 无变更 / 出错） */
  skipped?: string
  error?: string
}

/** 提交数据文件；无变更时不算失败，返回当前版本 */
export function commitData(author: string, email: string, message: string): CommitResult {
  const repo = dataRepo()
  if (!repo) {
    return { version: null, committed: false, skipped: '数据文件不在任何 git 仓库内，提交审计未启用' }
  }
  if (isIgnored(repo)) {
    return {
      version: null,
      committed: false,
      skipped: '数据文件被 .gitignore 忽略（数据与代码分离模式），本次只落盘、不提交',
    }
  }
  try {
    run(['add', '--', repo.rel], repo.root)
    run(['-c', `user.name=${author}`, '-c', `user.email=${email}`, 'commit', '-m', message, '--', repo.rel], repo.root)
    return { version: currentVersion(), committed: true }
  } catch (e) {
    return {
      version: currentVersion(),
      committed: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/** 数据文件的最近提交历史（用于审计展示） */
export interface CommitLogItem {
  hash: string
  author: string
  date: string
  message: string
}

export function dataHistory(limit = 50): CommitLogItem[] {
  const repo = dataRepo()
  if (!repo || isIgnored(repo)) return []
  const out = run(
    ['log', `-${limit}`, '--format=%H%x1f%an%x1f%cI%x1f%s', '--', repo.rel],
    repo.root,
    true,
  )
  if (!out) return []
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, author, date, message] = line.split('\x1f')
      return { hash, author, date, message }
    })
}
