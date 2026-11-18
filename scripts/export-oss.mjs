#!/usr/bin/env node
/**
 * 导出可发布的开源树（非破坏式：只读当前 git 提交，不改内部仓库）。
 *
 *   node scripts/export-oss.mjs --out /tmp/toposky-oss [--ref HEAD] [--git-init]
 *
 * 做的事：
 *   1. git archive 当前提交 → 目标目录（天然不含 data/、.next、node_modules）；
 *   2. 删除 internal/（内部资料与内部脚本）；
 *   3. 从 package.json 剥离指向 internal/ 的 npm 脚本；
 *   4. 自检：内部标识、内部路径引用、敏感文件、凭证特征、必需文件；
 *   5. --git-init 时初始化一个干净仓库并做首次提交（作者用中性身份）。
 *
 * 任何一项自检失败 → 退出码 1，不产出「可直接发布」的结论。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { loadExportPolicy, prepareOutputDirectory, removeExportDirectory, scanExportTree } from './lib/export-check.mjs'

const args = process.argv.slice(2)
const opt = (name, def = '') => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const has = (name) => args.includes(`--${name}`)

const OUT = opt('out')
const REF = opt('ref', 'HEAD')
const AUTHOR_NAME = opt('author-name', 'toposky release')
const AUTHOR_EMAIL = opt('author-email', 'release@example.com')
if (!OUT) {
  console.error('用法: node scripts/export-oss.mjs --out <目标目录> [--ref HEAD] [--git-init] [--author-name <名字>] [--author-email <邮箱>]')
  process.exit(2)
}

const SRC = process.cwd()
let OUT_ABS
let organizationPolicy
try {
  organizationPolicy = loadExportPolicy(SRC)
  // Refuse symlinks before extraction or package rewriting can follow them.
  const tree = execFileSync('git', ['ls-tree', '-rz', '-r', REF], { cwd: SRC }).toString('utf8')
  if (tree.split('\0').some((entry) => entry.startsWith('120000 ') || entry.startsWith('160000 '))) {
    throw new Error('提交包含符号链接或子模块；不能保证独立完整的公开树')
  }
  OUT_ABS = prepareOutputDirectory(SRC, OUT)
} catch (error) {
  console.error(error.message)
  process.exit(2)
}

if (organizationPolicy.configured) {
  console.log(`组织规则已配置：${organizationPolicy.patterns.length} 条；仅从源仓私有 JSON 加载，不随导出发布`)
} else {
  console.log('组织规则未配置：仅执行通用安全检查，未审计组织特定标识')
}

/* ============================== 1. 导出 ============================== */

const archive = execFileSync('git', ['archive', '--format=tar', REF], { cwd: SRC, maxBuffer: 256 * 1024 * 1024 })
execFileSync('tar', ['-xf', '-', '-C', OUT_ABS], { input: archive })
console.log(`已导出 ${REF} → ${OUT_ABS}`)

/* ============================== 2. 剔除内部资料 ============================== */

const hadInternal = removeExportDirectory(OUT_ABS, 'internal')
console.log(`已排除 internal/${hadInternal ? '' : '（源树中不存在，跳过）'}`)

for (const junk of ['.next', 'node_modules', 'test-results', '.playwright-mcp']) {
  removeExportDirectory(OUT_ABS, junk)
}

/* ============================== 3. 剥离内部 npm 脚本 ============================== */

const pkgPath = path.join(OUT_ABS, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
const removedScripts = []
for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
  if (typeof cmd === 'string' && cmd.includes('internal/')) {
    delete pkg.scripts[name]
    removedScripts.push(name)
  }
}
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log(`已剥离 ${removedScripts.length} 条内部 npm 脚本${removedScripts.length ? `：${removedScripts.join(', ')}` : ''}`)

/* ============================== 4. 自检 ============================== */

// Mechanism-based references, not every occurrence of a protected directory.
// Exclusion globs and synthetic fixture paths are legitimate release policy.
const INTERNAL_PATH_PATTERNS = [
  // ESM imports/re-exports (including a 'from' line of a multiline import),
  // CommonJS and dynamic imports.
  /(?:\bfrom\s+|\bimport\s+|\b(?:require(?:\.resolve)?|import)\s*\(\s*)['"](?:[^'"\n]*\/)?internal\/[^'"\n]+['"]/,
  // Markdown inline/reference links and HTML links/embedded source URLs.
  /\]\(\s*<?(?:[^\s)>]*\/)?internal\/[^\s)>]+|^\s*\[[^\]]+\]:\s*<?(?:[^\s>]*\/)?internal\/[^\s>]+|\b(?:href|src)\s*=\s*['"](?:[^'"\n]*\/)?internal\/[^'"\n]+['"]/,
  // Script execution instructions, including typical interpreter flags.
  /\b(?:node|tsx|ts-node|bash|sh|python3?)\s+(?:--?[^\s'"]+\s+)*['"]?(?:[^\s'"]*\/)?internal\/[^\s'"]+/,
]

const scan = scanExportTree(OUT_ABS, {
  internalPatterns: [
    ...organizationPolicy.patterns,
    ...INTERNAL_PATH_PATTERNS.map((pattern) => ['内部路径引用', pattern]),
  ],
})
const { files, problems, warnings } = scan

// 必需文件
for (const must of ['README.md', 'LICENSE', 'NOTICE', 'CONTRIBUTING.md', 'SECURITY.md', 'package.json', 'package-lock.json', 'examples/demo/topology.json', 'topology.schema.json']) {
  if (!fs.existsSync(path.join(OUT_ABS, must))) problems.push(`缺少必需文件：${must}`)
}
// 不应存在的路径
for (const forbidden of ['data', 'internal', '.next', 'node_modules']) {
  if (fs.existsSync(path.join(OUT_ABS, forbidden))) problems.push(`导出树中不应存在：${forbidden}/`)
}

const pkgAfter = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
if (!pkgAfter.license) warnings.push('package.json 缺少 license 字段')

const totalBytes = files.reduce((n, f) => n + fs.statSync(f).size, 0)
console.log(`\n自检：${files.length} 个文件 / ${(totalBytes / 1024 / 1024).toFixed(2)} MB；扫描 ${scan.scannedFiles} 个文件 / ${scan.bytes} 字节（含点文件与未知扩展名）`)
console.log('扫描排除 0 个文件：包括导出脚本自身，全部公开文件应用通用规则与已配置组织规则')
if (warnings.length) {
  console.log(`⚠️  ${warnings.length} 条告警：`)
  warnings.forEach((w) => console.log(`   - ${w}`))
}
if (problems.length) {
  console.error(`\n❌ ${problems.length} 个问题（导出物不可直接发布）：`)
  problems.slice(0, 40).forEach((p) => console.error(`   - ${p}`))
  if (problems.length > 40) console.error(`   … 其余 ${problems.length - 40} 条`)
  process.exit(1)
}

/* ============================== 5. 可选：初始化干净仓库 ============================== */

if (has('git-init')) {
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: OUT_ABS })
  execFileSync('git', ['add', '--', ...files.map((file) => path.relative(OUT_ABS, file))], { cwd: OUT_ABS })
  execFileSync(
    'git',
    ['-c', `user.name=${AUTHOR_NAME}`, '-c', `user.email=${AUTHOR_EMAIL}`, 'commit', '-q', '-m', 'chore: 首个开源版本'],
    { cwd: OUT_ABS },
  )
  console.log('\n已初始化干净仓库（单次提交，不含历史）。发布前请改提交作者。')
}

console.log('\n✅ 自检通过：所扫描文件通用安全规则 0 命中、无实例数据、必需文件齐全（规则扫描不等于无凭证保证）')
if (organizationPolicy.configured) {
  console.log(`组织规则审计：已配置的 ${organizationPolicy.patterns.length} 条规则全量应用，0 命中（不代表规则完备）`)
}
console.log('\n下一步建议：')
console.log('  1. 在导出目录里跑一遍：npm ci && npm run validate && npm run tsc && npm run lint && npm test && npm run build')
console.log('  2. 人工确认版权授权、目标仓库地址与可用的私密漏洞报告渠道')
console.log('  3. 推送到公开远端（导出目录的历史与内部仓库无关）')
