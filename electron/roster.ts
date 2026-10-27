import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RosterFileResult } from '../src/types'
import { createRosterFile, parseRosterFile } from '../src/lib/roster-file'

function sourceRosterPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../data/players.json')
}

function writableRosterPath(): string {
  if (!app.isPackaged && process.env.LOL_RANDOMIZER_ROSTER_PATH) return resolve(process.env.LOL_RANDOMIZER_ROSTER_PATH)
  return app.isPackaged ? join(app.getPath('userData'), 'players.json') : sourceRosterPath()
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'))
}

export async function loadRosterFile(): Promise<RosterFileResult> {
  const path = writableRosterPath()
  try {
    const roster = parseRosterFile(await readJson(path))
    return { players: roster.players, path, gitTrackable: !app.isPackaged, exists: true }
  } catch (error) {
    const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
    if (!missing) throw error
  }

  if (app.isPackaged) {
    try {
      const bundled = parseRosterFile(await readJson(join(app.getAppPath(), 'data', 'players.json')))
      return { players: bundled.players, path, gitTrackable: false, exists: false }
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      if (!missing) throw error
    }
  }
  return { players: [], path, gitTrackable: !app.isPackaged, exists: false }
}

export async function saveRosterFile(value: unknown): Promise<RosterFileResult> {
  const roster = createRosterFile(value)
  const path = writableRosterPath()
  const temporaryPath = `${path}.tmp`
  await mkdir(dirname(path), { recursive: true })
  await writeFile(temporaryPath, `${JSON.stringify(roster, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await rename(temporaryPath, path)
  return { players: roster.players, path, gitTrackable: !app.isPackaged, exists: true }
}
