import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export const DEMO_ROUTES = ['/', '/topology', '/processes', '/assets', '/impact', '/metadata', '/flows']
const SOURCE_FILES = [
  'package.json', 'package-lock.json', 'next.config.js', 'tsconfig.json', 'postcss.config.js',
  'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'examples/demo/topology.json',
  'scripts/lib/demo-path.mjs', 'scripts/third-party-notices.mjs',
]
const PUBLIC_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.txt'])

function copyPublicTree(source, destination, relative = '') {
  const stat = fs.lstatSync(source)
  if (stat.isSymbolicLink()) throw new Error('Public build inputs must not be symlinks')
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true })
    for (const name of fs.readdirSync(source)) {
      if (name.startsWith('.') || name === 'node_modules') continue
      const child = relative ? `${relative}/${name}` : name
      if (child === 'src/data' || child === 'src/app/api') continue
      copyPublicTree(path.join(source, name), path.join(destination, name), child)
    }
  } else if (stat.isFile() && (PUBLIC_EXTENSIONS.has(path.extname(source)) || ['LICENSE', 'NOTICE'].includes(path.basename(source)))) {
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
  } else {
    throw new Error('Unexpected file in public build inputs')
  }
}

/** A positive allow-list: never copy the repository root, local env, private data or internal material. */
export function prepareDemoSource(root, destination, { linkDependencies = true } = {}) {
  const sourceRoot = fs.realpathSync(root)
  const targetRoot = fs.realpathSync(destination)
  if (targetRoot === sourceRoot || targetRoot.startsWith(`${sourceRoot}${path.sep}`)) {
    throw new Error('Demo staging must be outside the source repository')
  }
  if (fs.readdirSync(targetRoot).length) throw new Error('Demo staging must be empty')
  for (const file of SOURCE_FILES) copyPublicTree(path.join(sourceRoot, file), path.join(targetRoot, file), file)
  copyPublicTree(path.join(sourceRoot, 'src'), path.join(targetRoot, 'src'), 'src')
  copyPublicTree(path.join(sourceRoot, 'licenses'), path.join(targetRoot, 'licenses'), 'licenses')
  if (fs.existsSync(path.join(sourceRoot, 'public'))) copyPublicTree(path.join(sourceRoot, 'public'), path.join(targetRoot, 'public'), 'public')
  if (linkDependencies) fs.symlinkSync(fs.realpathSync(path.join(sourceRoot, 'node_modules')), path.join(targetRoot, 'node_modules'), 'dir')
}

/** Fingerprint protected source/config/cache entries without reading private file contents. */
export function protectedSourceFingerprint(root) {
  const records = []
  function visit(relative) {
    const file = path.join(root, relative)
    let stat
    try { stat = fs.lstatSync(file) } catch (error) {
      if (error.code !== 'ENOENT') throw error
      records.push([relative, 'missing'])
      return
    }
    records.push([relative, stat.mode, stat.size, stat.mtimeMs, stat.ctimeMs, stat.isSymbolicLink() ? fs.readlinkSync(file) : ''])
    if (stat.isDirectory()) for (const name of fs.readdirSync(file).sort()) visit(`${relative}/${name}`)
  }
  for (const relative of [...SOURCE_FILES, 'src', 'licenses', 'public', '.next', '.next-demo', '.demo-api-backup', 'next-env.d.ts', 'tsconfig.tsbuildinfo']) visit(relative)
  return createHash('sha256').update(JSON.stringify(records)).digest('hex')
}

export function validateDemoOutputTarget(root) {
  const sourceRoot = fs.realpathSync(root)
  const output = path.resolve(sourceRoot, 'out')
  if (path.dirname(output) !== sourceRoot || path.basename(output) !== 'out') throw new Error('Unexpected demo output location')
  let stat
  try { stat = fs.lstatSync(output) } catch (error) {
    if (error.code === 'ENOENT') return output
    throw error
  }
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(output) !== output) throw new Error('Unsafe demo output directory')
  function rejectSymlinks(directory) {
    for (const name of fs.readdirSync(directory)) {
      const child = path.join(directory, name)
      const entry = fs.lstatSync(child)
      if (entry.isSymbolicLink()) throw new Error('Demo output must not contain symlinks')
      if (entry.isDirectory()) rejectSymlinks(child)
    }
  }
  rejectSymlinks(output)
  const marker = path.join(output, '.demo-build-manifest.json')
  const knownExport = fs.existsSync(path.join(output, 'index.html')) && fs.statSync(path.join(output, 'index.html')).isFile()
    && fs.existsSync(path.join(output, '_next')) && fs.statSync(path.join(output, '_next')).isDirectory()
    && fs.readFileSync(path.join(output, 'index.html'), 'utf8').includes('self.__next_f.push')
  let owned = false
  if (fs.existsSync(marker)) {
    const metadata = JSON.parse(fs.readFileSync(marker, 'utf8'))
    owned = metadata.generator === 'toposky-demo' && metadata.schemaVersion === 1
  }
  if (!owned && !knownExport) throw new Error('Refusing to replace an unrecognised out directory')
  return output
}

export function publishDemoOutput(root, compiledOutput) {
  const sourceRoot = fs.realpathSync(root)
  const output = validateDemoOutputTarget(sourceRoot)
  const staging = fs.mkdtempSync(path.join(sourceRoot, '.demo-output-'))
  const safeStaging = fs.realpathSync(staging)
  if (path.dirname(safeStaging) !== sourceRoot || !path.basename(safeStaging).startsWith('.demo-output-')) throw new Error('Unexpected output staging directory')
  try {
    fs.cpSync(compiledOutput, safeStaging, { recursive: true, errorOnExist: true })
    // Revalidate immediately before removing an existing known output, never follow a user symlink.
    if (validateDemoOutputTarget(sourceRoot) !== output) throw new Error('Output location changed')
    if (fs.existsSync(output)) fs.rmSync(output, { recursive: true })
    fs.renameSync(safeStaging, output)
  } finally {
    if (fs.existsSync(safeStaging)) {
      if (fs.realpathSync(safeStaging) !== safeStaging || path.dirname(safeStaging) !== sourceRoot) throw new Error('Unsafe output cleanup')
      fs.rmSync(safeStaging, { recursive: true })
    }
  }
  return output
}
