import type { AppState, ConfirmedGame, Draft, MetaDataset, Settings } from '../types'
import { validateMetaDataset } from './meta'

export const STORAGE_KEY = 'lol-randomizer:state:v2'

export const DEFAULT_SETTINGS: Settings = { cooldownGames: 3, minPickRate: 0.5, minGames: 5000 }

export const DEFAULT_STATE: AppState = {
  schemaVersion: 2,
  players: ['', '', '', '', ''],
  draft: null,
  history: [],
  settings: DEFAULT_SETTINGS,
  customDataset: null,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isChampion = (value: unknown): boolean =>
  isRecord(value) && Number.isInteger(value.id) && typeof value.name === 'string' && typeof value.slug === 'string' && typeof value.role === 'string'

const isDraft = (value: unknown): value is Draft =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.createdAt === 'string' &&
  typeof value.patch === 'string' &&
  Array.isArray(value.slots) &&
  value.slots.length === 5 &&
  value.slots.every((slot) => isRecord(slot) && typeof slot.player === 'string' && typeof slot.role === 'string' && isChampion(slot.champion))

const isGame = (value: unknown): value is ConfirmedGame =>
  isDraft(value) && isRecord(value) && Number.isInteger(value.number) && typeof value.confirmedAt === 'string'

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

export function sanitizeState(value: unknown): AppState {
  if (!isRecord(value)) return DEFAULT_STATE
  const players = Array.isArray(value.players)
    ? [...value.players.filter((item): item is string => typeof item === 'string').slice(0, 5), '', '', '', '', ''].slice(0, 5)
    : DEFAULT_STATE.players
  const settingsRecord = isRecord(value.settings) ? value.settings : {}
  const settings: Settings = {
    cooldownGames: Math.round(clampNumber(settingsRecord.cooldownGames, 0, 10, 3)),
    minPickRate: clampNumber(settingsRecord.minPickRate, 0, 100, 0.5),
    minGames: Math.round(clampNumber(settingsRecord.minGames, 0, 10_000_000, 5000)),
  }
  let customDataset: MetaDataset | null = null
  if (value.customDataset) {
    try { customDataset = validateMetaDataset(value.customDataset) } catch { customDataset = null }
  }
  return {
    schemaVersion: 2,
    players,
    draft: isDraft(value.draft) ? value.draft : null,
    history: Array.isArray(value.history) ? value.history.filter(isGame) : [],
    settings,
    customDataset,
  }
}

export function loadState(storage: Pick<Storage, 'getItem'> = localStorage): AppState {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    return raw ? sanitizeState(JSON.parse(raw)) : DEFAULT_STATE
  } catch {
    return DEFAULT_STATE
  }
}

export function saveState(state: AppState, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* Soukromý režim nebo plné úložiště nesmí shodit aplikaci. */ }
}

export interface HistoryBackup {
  schemaVersion: 1
  exportedAt: string
  history: ConfirmedGame[]
}

export function createHistoryBackup(history: ConfirmedGame[]): HistoryBackup {
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), history }
}

export function validateHistoryBackup(value: unknown): ConfirmedGame[] {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.history) || !value.history.every(isGame)) {
    throw new Error('Soubor není platná záloha historie verze 1.')
  }
  return value.history
}
