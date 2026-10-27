import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { StatisticsFileResult } from '../src/types'
import { createStatisticsFile, parseStatisticsFile } from '../src/lib/statistics-file'

let saveQueue = Promise.resolve()

function sourceStatisticsPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../data/statistics.json')
}

function writableStatisticsPath(): string {
  if (!app.isPackaged && process.env.LOL_RANDOMIZER_STATISTICS_PATH) return resolve(process.env.LOL_RANDOMIZER_STATISTICS_PATH)
  return app.isPackaged ? join(app.getPath('userData'), 'statistics.json') : sourceStatisticsPath()
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'))
}

export async function loadStatisticsFile(): Promise<StatisticsFileResult> {
  const path = writableStatisticsPath()
  try {
    const statistics = parseStatisticsFile(await readJson(path))
    return { matches: statistics.matches, path, gitTrackable: !app.isPackaged, exists: true }
  } catch (error) {
    const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
    if (!missing) throw error
  }

  if (app.isPackaged) {
    try {
      const bundled = parseStatisticsFile(await readJson(join(app.getAppPath(), 'data', 'statistics.json')))
      return { matches: bundled.matches, path, gitTrackable: false, exists: false }
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      if (!missing) throw error
    }
  }
  return { matches: [], path, gitTrackable: !app.isPackaged, exists: false }
}

export function saveStatisticsFile(value: unknown): Promise<StatisticsFileResult> {
  const statistics = createStatisticsFile(value)
  const path = writableStatisticsPath()
  const operation = saveQueue.then(async () => {
    const temporaryPath = `${path}.tmp`
    await mkdir(dirname(path), { recursive: true })
    await writeFile(temporaryPath, `${JSON.stringify(statistics, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temporaryPath, path)
    return { matches: statistics.matches, path, gitTrackable: !app.isPackaged, exists: true }
  })
  saveQueue = operation.then(() => undefined, () => undefined)
  return operation
}
