import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { productionPackages, renderManifest, bundleLicenses } from '../scripts/third-party-notices.mjs'

const lock = {
  lockfileVersion: 3,
  packages: {
    '': { version: '0.1.0', license: 'Apache-2.0' },
    'node_modules/zeta': { version: '2.0.0', license: 'MIT' },
    'node_modules/alpha': { version: '1.0.0', license: 'Python-2.0', optional: true },
    'node_modules/dev-only': { version: '1.0.0', license: 'MIT', dev: true },
  },
}

test('license inventory includes transitive/platform production entries and excludes dev-only entries', () => {
  const rows = productionPackages(lock)
  assert.deepEqual(rows.map((row) => row.name), ['alpha', 'zeta'])
  assert.equal(rows[0].optional, true)
  const text = renderManifest(lock)
  assert.match(text, /2\/2 production lockfile entries/)
  assert.match(text, /licenses\/Python-2.0.txt/)
  assert.doesNotMatch(text, /dev-only/)
  assert.equal(text, renderManifest(lock))
})

test('license inventory rejects missing metadata, unreviewed licenses and traversal locations', () => {
  for (const entry of [{ version: '1.0.0' }, { license: 'MIT' }, { version: '1.0.0', license: 'AGPL-3.0-only' }]) {
    assert.throws(() => productionPackages({ lockfileVersion: 3, packages: { 'node_modules/example': entry } }))
  }
  assert.throws(() => productionPackages({ lockfileVersion: 3, packages: {
    'node_modules/../private': { version: '1.0.0', license: 'MIT' },
  } }))
})

test('distribution bundle preserves installed vendor copyright and includes standard license texts', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toposky-license-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'node_modules', 'zeta'), { recursive: true })
  fs.writeFileSync(path.join(root, 'node_modules', 'zeta', 'package.json'), '{"name":"zeta"}')
  fs.writeFileSync(path.join(root, 'node_modules', 'zeta', 'LICENSE'), 'Copyright fictional library authors\nMIT license notice')
  fs.mkdirSync(path.join(root, 'licenses'))
  for (const id of ['0BSD', 'Apache-2.0', 'BSD-3-Clause', 'CC-BY-4.0', 'EPL-2.0', 'GPL-3.0-or-later', 'ISC', 'LGPL-3.0-or-later', 'MIT', 'Python-2.0']) {
    fs.writeFileSync(path.join(root, 'licenses', `${id}.txt`), `Standard ${id}`)
  }
  const bundle = bundleLicenses(root, lock)
  assert.equal(bundle.installed, 1)
  assert.equal(bundle.withVendorNotices, 1)
  assert.deepEqual(bundle.withoutVendorNotices, [])
  assert.match(bundle.text, /Copyright fictional library authors/)
  assert.match(bundle.text, /Standard LGPL-3.0-or-later/)
  assert.doesNotMatch(bundle.text, /===== alpha@/)
})
