#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/** Only the image's default, empty /data volume is initialised. Explicit paths remain fail-fast. */
export function initializeDefaultData({ env = process.env, root = process.cwd(), defaultDirectory = '/data' } = {}) {
  if (env.TOPOLOGY_DATA?.trim() || env.TOPOLOGY_ROOT?.trim()) return false
  if (env.TOPOLOGY_DATA_DIR?.trim() !== defaultDirectory) return false
  const directory = path.resolve(defaultDirectory)
  const stat = fs.lstatSync(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe default data directory')
  // Any existing entry (including an invalid file or a dangling symlink) belongs to the operator.
  if (fs.readdirSync(directory).length !== 0) return false
  const demo = path.join(root, 'examples', 'demo', 'topology.json')
  const data = JSON.parse(fs.readFileSync(demo, 'utf8'))
  if (!Array.isArray(data.nodes) || !Array.isArray(data.relations) || !data.nodes.length) {
    throw new Error('Invalid bundled demo data')
  }
  try {
    fs.copyFileSync(demo, path.join(directory, 'topology.json'), fs.constants.COPYFILE_EXCL)
    return true
  } catch (error) {
    if (error.code === 'EEXIST') return false // Another container/initializer won the race.
    throw error
  }
}

export function runEntrypoint(command = process.argv.slice(2)) {
  try {
    if (initializeDefaultData()) console.log('Initialised empty default data volume with fictional demo data.')
  } catch {
    console.error('Unable to initialise the default data volume; check its permissions and configuration.')
    process.exitCode = 1
    return
  }
  if (!command.length) {
    console.error('A container command is required.')
    process.exitCode = 1
    return
  }
  const child = spawn(command[0], command.slice(1), { stdio: 'inherit' })
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal))
  child.on('error', () => {
    console.error('Unable to start the application.')
    process.exitCode = 1
  })
  child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 143) })
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) runEntrypoint()
