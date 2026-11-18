#!/usr/bin/env node
/** Build a read-only demo from a positive public-source allow-list, never mutate API or dev caches. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { normalizeBasePath } from './lib/demo-path.mjs'
import { prepareDemoSource, protectedSourceFingerprint, validateDemoOutputTarget, publishDemoOutput } from './lib/demo-build.mjs'
import { checkDemo } from './check-demo.mjs'

export function demoBuildEnvironment(env, basePath) {
  // Do not inherit TOPOLOGY_*, .env settings, unrelated NEXT_PUBLIC_* or credential-bearing build env.
  const safe = {}
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'SYSTEMROOT', 'COMSPEC', 'USERPROFILE', 'LANG', 'LC_ALL', 'CI']) {
    if (env[key] !== undefined) safe[key] = env[key]
  }
  return { ...safe, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_DEMO: '1', NEXT_STATIC_EXPORT: '1', NEXT_PUBLIC_BASE_PATH: normalizeBasePath(basePath) }
}

export function buildDemo({ root = process.cwd(), basePath = process.env.NEXT_PUBLIC_BASE_PATH || '' } = {}) {
  const sourceRoot = fs.realpathSync(root)
  const prefix = normalizeBasePath(basePath)
  validateDemoOutputTarget(sourceRoot) // Fail before doing work if out belongs to the user or is a symlink.
  const before = protectedSourceFingerprint(sourceRoot)
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'toposky-demo-'))
  const scratch = fs.realpathSync(temporary)
  const temporaryRoot = fs.realpathSync(os.tmpdir())
  if (path.dirname(scratch) !== temporaryRoot || !path.basename(scratch).startsWith('toposky-demo-')) throw new Error('Unexpected isolated build location')
  try {
    prepareDemoSource(sourceRoot, scratch)
    const env = demoBuildEnvironment(process.env, prefix)
    console.log(`Building isolated fictional demo (basePath: ${prefix || '/'})`)
    execFileSync('npm', ['run', 'notices:check'], { cwd: scratch, env, stdio: 'inherit' })
    execFileSync('npm', ['run', 'notices:bundle'], { cwd: scratch, env, stdio: 'inherit' })
    // External dependency symlinks would require expanding Turbopack's root to include private source.
    // Webpack supports the linked dependency tree without expanding this public staging boundary.
    execFileSync(process.execPath, [path.join(scratch, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build', '--webpack'], { cwd: scratch, env, stdio: 'inherit' })
    const compiled = path.join(scratch, 'out')
    if (!fs.existsSync(path.join(compiled, 'index.html'))) throw new Error('Static demo export is missing')
    const legal = path.join(compiled, 'legal')
    fs.mkdirSync(legal)
    for (const file of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md']) fs.copyFileSync(path.join(scratch, file), path.join(legal, file))
    fs.cpSync(path.join(scratch, 'licenses'), path.join(legal, 'licenses'), { recursive: true })
    fs.copyFileSync(path.join(scratch, 'build', 'legal', 'THIRD_PARTY_LICENSES.txt'), path.join(legal, 'THIRD_PARTY_LICENSES.txt'))
    fs.writeFileSync(path.join(compiled, '.nojekyll'), '')
    if (protectedSourceFingerprint(sourceRoot) !== before) throw new Error('Source/API/development caches changed during isolated build; output was not published')
    fs.writeFileSync(path.join(compiled, '.demo-build-manifest.json'), JSON.stringify({
      generator: 'toposky-demo', schemaVersion: 1, basePath: prefix,
      sourceUnchanged: true, sourceFingerprint: before, apiExcluded: true,
    }, null, 2) + '\n')
    const result = checkDemo({ directory: compiled, basePath: prefix, sourceRoot })
    const output = publishDemoOutput(sourceRoot, compiled)
    console.log(`Verified and published demo to ${output}: ${result.pages} pages, ${result.references} local references, no API routes; source/cache unchanged.`)
    return result
  } finally {
    // The only recursive cleanup is our verified fresh external scratch directory.
    if (fs.realpathSync(scratch) !== scratch || path.dirname(scratch) !== temporaryRoot || !path.basename(scratch).startsWith('toposky-demo-')) throw new Error('Unsafe isolated build cleanup')
    fs.rmSync(scratch, { recursive: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { buildDemo() } catch (error) {
    console.error(`Demo build failed: ${error.message}`)
    process.exitCode = 1
  }
}
