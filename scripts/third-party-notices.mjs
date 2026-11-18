#!/usr/bin/env node
/** Deterministic production-dependency inventory and redistributable license bundle. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const STANDARD_LICENSES = [
  '0BSD', 'Apache-2.0', 'BSD-3-Clause', 'CC-BY-4.0', 'EPL-2.0',
  'GPL-3.0-or-later', 'ISC', 'LGPL-3.0-or-later', 'MIT', 'Python-2.0',
]

export function productionPackages(lock) {
  if (lock.lockfileVersion !== 3 || !lock.packages) throw new Error('Expected npm lockfile v3')
  return Object.entries(lock.packages)
    .filter(([location, entry]) => location && !entry.dev)
    .map(([location, entry]) => {
      if (!location.startsWith('node_modules/') || location.split('/').includes('..')) {
        throw new Error(`Invalid dependency location: ${location}`)
      }
      if (!entry.version || !entry.license) throw new Error(`Missing version or license: ${location}`)
      const name = location.split('node_modules/').at(-1)
      const ids = entry.license.match(/[A-Za-z0-9][A-Za-z0-9.+-]*/g)
        ?.filter((id) => !['AND', 'OR', 'WITH'].includes(id)) || []
      for (const id of ids) {
        if (!STANDARD_LICENSES.includes(id)) throw new Error(`Unreviewed license ${id}: ${name}`)
      }
      return { name, location, version: entry.version, license: entry.license, optional: !!entry.optional }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en') || a.version.localeCompare(b.version, 'en') || a.location.localeCompare(b.location, 'en'))
}

export function renderManifest(lock) {
  const packages = productionPackages(lock)
  const licenses = [...new Set(packages.flatMap((entry) => entry.license.match(/[A-Za-z0-9][A-Za-z0-9.+-]*/g)
    .filter((id) => !['AND', 'OR', 'WITH'].includes(id))))].sort()
  return [
    '# Third-party dependency notices', '',
    'Generated from the production entries of the npm lockfile, including transitive and optional',
    'platform packages. Development-only entries are excluded. This is a locked dependency inventory,',
    'not a claim that every listed package is present in every image or browser bundle.', '',
    `Inventory coverage: **${packages.length}/${packages.length} production lockfile entries** have a declared version and license.`, '',
    'Regenerate with `npm run notices:generate`; CI checks it with `npm run notices:check`.',
    '`npm run notices:bundle` collects installed-package license/copyright notices and the standard',
    'license texts into `build/legal/THIRD_PARTY_LICENSES.txt` for distribution.', '',
    '## License texts', '',
    ...licenses.map((id) => `- [${id}](licenses/${id}.txt)`), '',
    '## Important distribution notes', '',
    '- TopoSky does not relicense its dependencies. Their original terms and attribution remain applicable.',
    '- `elkjs` is used unmodified under EPL-2.0. Its upstream source is https://github.com/kieler/elkjs.',
    '- `sharp` uses platform-specific libvips binaries and associated libraries. LGPL components remain',
    '  dynamically linked and unmodified; preserve the license notices and the ability to replace those',
    '  libraries. Sharp/libvips source and build recipes are available at https://github.com/lovell/sharp,',
    '  https://github.com/lovell/sharp-libvips and https://github.com/libvips/libvips. A distributor must',
    '  review corresponding-source and other obligations for the exact binaries/platform being shipped.',
    '- `argparse` uses Python-2.0; `caniuse-lite` data uses CC-BY-4.0. Preserve the notices in the bundle.',
    '- The Node base image and its operating-system packages are outside this npm inventory; preserve',
    '  their notices separately when distributing container images.',
    '- This inventory and the license bundle are engineering checks, not legal clearance.', '',
    '## Locked production packages', '',
    '| Package | Version | Declared license | Optional/platform-specific |',
    '|---|---|---|---|',
    ...packages.map((entry) => `| [${entry.name}](https://www.npmjs.com/package/${entry.name}/v/${entry.version}) | ${entry.version} | ${entry.license} | ${entry.optional ? 'yes' : 'no'} |`), '',
  ].join('\n')
}

export function bundleLicenses(root, lock) {
  const packages = productionPackages(lock)
  const sections = ['Third-party licenses and copyright notices',
    'This bundle records installed production packages for this build platform.',
    'Absent optional platform packages remain documented in THIRD_PARTY_NOTICES.md.', '']
  let installed = 0
  let withVendorNotices = 0
  const withoutVendorNotices = []
  for (const entry of packages) {
    const dir = path.join(root, entry.location)
    if (!fs.existsSync(path.join(dir, 'package.json'))) continue
    installed++
    const files = []
    function collectNotices(current, depth = 0) {
      for (const file of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, file.name)
        if (file.isFile() && /^(?:licen[cs]e|copying|copyright|notice)(?:[._-].*)?$/i.test(file.name)) {
          files.push(path.relative(dir, full))
        } else if (file.isDirectory() && depth < 6 && !['node_modules', '.git'].includes(file.name)) {
          collectNotices(full, depth + 1)
        }
      }
    }
    collectNotices(dir)
    files.sort()
    sections.push(`\n===== ${entry.name}@${entry.version} (${entry.license}) =====`,
      `Package source: https://www.npmjs.com/package/${entry.name}/v/${entry.version}`)
    if (files.length) withVendorNotices++
    else {
      withoutVendorNotices.push(entry.name)
      sections.push('No separate vendor notice found in this npm package. See the declared',
        'standard license below and the upstream package for additional attribution/source obligations.')
    }
    for (const file of files) sections.push(`\n--- ${file} ---`, fs.readFileSync(path.join(dir, file), 'utf8'))
    // libvips npm metadata summarizes only LGPL; its README records the bundled
    // component licenses and versions.json identifies their exact source versions.
    if (entry.name.startsWith('@img/sharp-libvips-')) {
      for (const file of ['README.md', 'versions.json']) {
        if (fs.existsSync(path.join(dir, file))) sections.push(`\n--- Upstream component documentation: ${file} ---`, fs.readFileSync(path.join(dir, file), 'utf8'))
      }
    }
  }
  for (const id of STANDARD_LICENSES) {
    sections.push(`\n===== Standard license: ${id} =====`, fs.readFileSync(path.join(root, 'licenses', `${id}.txt`), 'utf8'))
  }
  sections.push('\n===== Coverage =====',
    `Installed production entries: ${installed}; entries with vendor notices: ${withVendorNotices}.`,
    `No separate vendor notice: ${withoutVendorNotices.join(', ') || '(none)'}.`,
    'The bundle does not certify corresponding-source compliance or cover the operating-system image.', '')
  return { text: sections.join('\n'), installed, withVendorNotices, withoutVendorNotices }
}

function main() {
  const root = process.cwd()
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'))
  const manifestPath = path.join(root, 'THIRD_PARTY_NOTICES.md')
  const manifest = renderManifest(lock)
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(manifestPath) || fs.readFileSync(manifestPath, 'utf8') !== manifest) {
      throw new Error('Third-party inventory is stale; run npm run notices:generate')
    }
    for (const id of STANDARD_LICENSES) {
      if (!fs.statSync(path.join(root, 'licenses', `${id}.txt`)).isFile()) throw new Error(`Missing license text: ${id}`)
    }
    console.log(`Third-party inventory is current: ${productionPackages(lock).length} production entries`)
  } else if (process.argv.includes('--bundle')) {
    const bundle = bundleLicenses(root, lock)
    const dest = path.join(root, 'build', 'legal')
    fs.mkdirSync(dest, { recursive: true })
    fs.writeFileSync(path.join(dest, 'THIRD_PARTY_LICENSES.txt'), bundle.text)
    console.log(`Bundled licenses: ${bundle.withVendorNotices}/${bundle.installed} installed production entries have vendor notices`)
    if (bundle.withoutVendorNotices.length) console.log(`Review upstream attribution/source requirements: ${bundle.withoutVendorNotices.join(', ')}`)
  } else {
    fs.writeFileSync(manifestPath, manifest)
    console.log(`Generated THIRD_PARTY_NOTICES.md: ${productionPackages(lock).length} production entries`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
