import fs from 'node:fs'
import path from 'node:path'

// Scan every regular file, including dotfiles, extensionless files and binary
// files (ASCII credential markers can occur in otherwise binary content).
const SECRET_PATTERNS = [
  ['私钥', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/],
  ['AWS Access Key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub Token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ['Slack Token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
]

// Private, optional source policy. It is never loaded from the output tree and
// contains data only: JSON.parse plus RegExp, never executable configuration.
export function loadExportPolicy(source) {
  const directory = path.join(fs.realpathSync(source), 'internal')
  const policyPath = path.join(directory, 'public-export-policy.json')
  const invalid = () => new Error('发布组织规则配置无效：internal/public-export-policy.json（格式、规则或文件边界错误）')
  try {
    const dirStat = fs.lstatSync(directory, { throwIfNoEntry: false })
    if (!dirStat) return { configured: false, patterns: [] }
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) throw invalid()
    const stat = fs.lstatSync(policyPath, { throwIfNoEntry: false })
    if (!stat) return { configured: false, patterns: [] }
    if (!stat.isFile() || stat.isSymbolicLink() || path.dirname(fs.realpathSync(policyPath)) !== directory) throw invalid()
    const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'))
    if (!policy || policy.version !== 1 || !Array.isArray(policy.rules) || policy.rules.length > 100) throw invalid()
    const patterns = policy.rules.map((rule) => {
      if (!rule || typeof rule.category !== 'string' || !rule.category.trim() || rule.category.length > 80 || /[\r\n]/.test(rule.category) ||
          typeof rule.pattern !== 'string' || !rule.pattern || rule.pattern.length > 4096 ||
          typeof (rule.flags ?? '') !== 'string' || !/^[imsu]*$/.test(rule.flags ?? '')) throw invalid()
      // Stateful g/y flags are deliberately unsupported; every line is checked.
      return [rule.category, new RegExp(rule.pattern, rule.flags ?? '')]
    })
    return { configured: true, patterns }
  } catch {
    // Do not echo parser/RegExp errors: they can contain private rule values.
    throw invalid()
  }
}

export function prepareOutputDirectory(source, output) {
  const src = fs.realpathSync(source)
  const requested = path.resolve(output)
  // Resolve existing ancestors before creating anything, so aliases cannot
  // bypass source/ancestor protection. Never remove an existing output tree.
  let ancestor = requested
  const suffix = []
  while (!fs.existsSync(ancestor)) {
    // existsSync hides dangling links; those must not be treated as absent.
    try {
      if (fs.lstatSync(ancestor).isSymbolicLink()) throw new Error('目标目录不能是符号链接')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    suffix.unshift(path.basename(ancestor))
    ancestor = path.dirname(ancestor)
  }
  if (fs.lstatSync(requested, { throwIfNoEntry: false })?.isSymbolicLink()) {
    throw new Error('目标目录不能是符号链接')
  }
  const out = path.resolve(fs.realpathSync(ancestor), ...suffix)
  if (out === src || src.startsWith(out + path.sep) || out.startsWith(src + path.sep)) {
    throw new Error('目标目录不能是仓库本身、父目录或仓库内目录')
  }
  if (fs.existsSync(out) && (!fs.statSync(out).isDirectory() || fs.readdirSync(out).length)) {
    throw new Error('目标目录已存在且非空；请使用新的或空的输出目录（不会删除现有文件）')
  }
  fs.mkdirSync(out, { recursive: true })
  return fs.realpathSync(out)
}

export function removeExportDirectory(output, name) {
  const root = fs.realpathSync(output)
  const target = path.resolve(root, name)
  if (path.dirname(target) !== root) throw new Error('拒绝清理输出目录以外的路径')
  const stat = fs.lstatSync(target, { throwIfNoEntry: false })
  if (!stat) return false
  if (stat.isSymbolicLink() || !fs.realpathSync(target).startsWith(root + path.sep)) {
    throw new Error('拒绝清理符号链接或输出目录以外的路径')
  }
  fs.rmSync(target, { recursive: true, force: true })
  return true
}

export function scanExportTree(root, { internalPatterns = [] } = {}) {
  const realRoot = fs.realpathSync(root)
  const files = []
  const problems = []
  const warnings = []
  let scannedFiles = 0
  let bytes = 0
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      const rel = path.relative(realRoot, file).split(path.sep).join('/')
      if (entry.isSymbolicLink()) {
        problems.push(`${rel}: 不允许符号链接（不能保证完整扫描与发布边界）`)
      } else if (entry.isDirectory()) {
        walk(file)
      } else if (entry.isFile()) {
        files.push(file)
        // Every exported regular file receives every configured rule.
        if (entry.name === '.env' || entry.name.startsWith('.env.') && entry.name !== '.env.example') {
          problems.push(`${rel}: 疑似本地环境文件`)
        }
        const buffer = fs.readFileSync(file)
        bytes += buffer.length
        scannedFiles++
        const lines = buffer.toString('utf8').split('\n')
        lines.forEach((line, index) => {
          for (const [label, pattern] of [...internalPatterns, ...SECRET_PATTERNS]) {
            if (pattern.test(line)) problems.push(`${rel}:${index + 1}: [${label}] 疑似敏感内容`)
          }
          if (/\.(ya?ml|json|mjs|js|ts)$/.test(file) && /\bpassword['"]?\s*[:=]\s*['"][^'"]{1,64}['"]/i.test(line)) {
            warnings.push(`${rel}:${index + 1}: 疑似硬编码密码`)
          }
        })
      } else {
        problems.push(`${rel}: 不支持的文件类型`)
      }
    }
  }
  walk(realRoot)
  return { files, problems, warnings, scannedFiles, bytes }
}
