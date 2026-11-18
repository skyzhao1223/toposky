#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { normalizeBasePath } from './lib/demo-path.mjs'
import { DEMO_ROUTES, protectedSourceFingerprint } from './lib/demo-build.mjs'

export function checkDemo({ directory = path.resolve('out'), basePath, sourceRoot = process.cwd(), checkSource = true } = {}) {
  const root = fs.realpathSync(directory)
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.demo-build-manifest.json'), 'utf8'))
  if (manifest.generator !== 'toposky-demo' || manifest.schemaVersion !== 1 || !manifest.sourceUnchanged || !manifest.apiExcluded) {
    throw new Error('Invalid demo build provenance')
  }
  const prefix = normalizeBasePath(basePath ?? manifest.basePath)
  if (manifest.basePath !== prefix) throw new Error('Demo base path differs from requested deployment')
  if (checkSource && protectedSourceFingerprint(sourceRoot) !== manifest.sourceFingerprint) throw new Error('Protected source/cache changed since the isolated build')
  const files = []
  function walk(directory) {
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name)
      const stat = fs.lstatSync(file)
      if (stat.isSymbolicLink()) throw new Error('Static output contains a symlink')
      if (stat.isDirectory()) walk(file)
      else files.push(file)
    }
  }
  walk(root)
  if (files.some((file) => /^(?:api|data|internal)(?:\/|$)/.test(path.relative(root, file).replaceAll(path.sep, '/'))
    || /(?:^|\/)\.env(?:\.|$)/.test(path.relative(root, file)))) throw new Error('Forbidden static API or private output')
  const htmlFiles = files.filter((file) => file.endsWith('.html'))
  if (!htmlFiles.length) throw new Error('No static pages were exported')
  let references = 0
  function verifyReference(value, pageUrl) {
    const href = value.replaceAll('&amp;', '&')
    if (!href || href.startsWith('#') || /^(?:data:|mailto:|tel:)/i.test(href)) return
    const url = new URL(href, pageUrl)
    if (url.origin !== 'https://demo.invalid') return
    if (prefix && url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) throw new Error('A static resource or link escapes the configured base path')
    const relative = decodeURIComponent(url.pathname.slice(prefix.length)).replace(/^\/+/, '')
    if (relative === 'api' || relative.startsWith('api/')) throw new Error('Static demo links to a server API')
    let target = path.resolve(root, relative)
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error('Static reference escapes output')
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html')
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error(`Missing exported reference: ${url.pathname}`)
    references++
  }
  for (const file of htmlFiles) {
    const relative = path.relative(root, file).replaceAll(path.sep, '/')
    const pageUrl = `https://demo.invalid${prefix}/${relative}`
    const html = fs.readFileSync(file, 'utf8')
    for (const match of html.matchAll(/<(?:a|link|script|img|source)\b[^>]*?\b(?:href|src)=["']([^"']+)["'][^>]*>/gi)) verifyReference(match[1], pageUrl)
  }
  for (const file of files.filter((file) => file.endsWith('.css'))) {
    const relative = path.relative(root, file).replaceAll(path.sep, '/')
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) {
      verifyReference(match[1], `https://demo.invalid${prefix}/${relative}`)
    }
  }
  for (const route of DEMO_ROUTES) {
    const page = path.join(root, route === '/' ? 'index.html' : `${route.slice(1)}/index.html`)
    const html = fs.readFileSync(page, 'utf8')
    for (const nav of DEMO_ROUTES.filter((route) => route !== '/flows')) {
      const expected = `${prefix}${nav === '/' ? '/' : `${nav}/`}`
      const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1])
      if (!anchors.includes(expected)) throw new Error(`Missing prefixed navigation on ${route}: ${expected}`)
    }
  }
  for (const file of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.txt']) {
    if (!fs.statSync(path.join(root, 'legal', file)).isFile()) throw new Error('Static license deliverable is missing')
  }
  return { pages: htmlFiles.length, routes: DEMO_ROUTES.length, references, files: files.length, basePath: prefix, sourceUnchanged: true, apiRoutes: 0 }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const option = (name) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1] }
    const result = checkDemo({ directory: option('--dir'), basePath: option('--base-path'), sourceRoot: option('--source-root') })
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(`Demo verification failed: ${error.message}`)
    process.exitCode = 1
  }
}
