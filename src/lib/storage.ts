import { ROLES, type AppState, type ConfirmedGame, type Draft, type MatchParticipantStats, type MatchSummary, type MetaDataset, type Player, type Settings } from '../types'
import { validateMetaDataset } from './meta'

export const STORAGE_KEY = 'lol-randomizer:state:v3'
const LEGACY_STORAGE_KEY = 'lol-randomizer:state:v2'

export const DEFAULT_SETTINGS: Settings = { cooldownGames: 3, minPickRate: 0.5, minGames: 5000 }

export const DEFAULT_STATE: AppState = {
  schemaVersion: 3,
  players: [],
  selectedPlayerIds: [],
  draft: null,
  history: [],
  settings: DEFAULT_SETTINGS,
  customDataset: null,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback
const finite = (value: unknown, fallback = 0): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback
const boolean = (value: unknown): boolean => value === true

const isChampion = (value: unknown): boolean =>
  isRecord(value) && Number.isInteger(value.id) && typeof value.name === 'string' && typeof value.slug === 'string' && ROLES.includes(value.role as never)

function playerIdFor(name: string, index: number): string {
  const normalized = name.trim().toLocaleLowerCase('cs').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'hrac'
  return `legacy-${index + 1}-${normalized}`
}

function sanitizePlayers(value: unknown): Player[] {
  if (!Array.isArray(value)) return []
  const result: Player[] = []
  const usedIds = new Set<string>()
  value.forEach((item, index) => {
    const candidate = typeof item === 'string'
      ? { id: playerIdFor(item, index), name: item.trim(), riotId: '' }
      : isRecord(item)
        ? { id: text(item.id, playerIdFor(text(item.name), index)), name: text(item.name).trim(), riotId: text(item.riotId).trim() }
        : null
    if (!candidate?.name) return
    let id = candidate.id || playerIdFor(candidate.name, index)
    if (usedIds.has(id)) id = `${id}-${index + 1}`
    usedIds.add(id)
    result.push({ ...candidate, id })
  })
  return result.slice(0, 50)
}

function normalizeDraft(value: unknown, players: Player[], maxSlots = 5): Draft | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.createdAt !== 'string' || typeof value.patch !== 'string' || !Array.isArray(value.slots)) return null
  if (value.slots.length < 1 || value.slots.length > maxSlots) return null
  const slots = value.slots.map((slot, index) => {
    if (!isRecord(slot) || typeof slot.player !== 'string' || !ROLES.includes(slot.role as never) || !isChampion(slot.champion)) return null
    const slotPlayer = slot.player
    const knownPlayer = players.find((player) => player.id === slot.playerId)
      ?? players.find((player) => player.name.toLocaleLowerCase('cs') === slotPlayer.toLocaleLowerCase('cs'))
    return {
      playerId: text(slot.playerId, knownPlayer?.id ?? playerIdFor(slotPlayer, index)),
      player: slotPlayer,
      riotId: text(slot.riotId, knownPlayer?.riotId ?? ''),
      role: slot.role,
      champion: slot.champion,
    }
  })
  if (slots.some((slot) => !slot)) return null
  return { id: value.id, createdAt: value.createdAt, patch: value.patch, slots: slots as Draft['slots'] }
}

function normalizeParticipant(value: unknown): MatchParticipantStats | null {
  if (!isRecord(value) || typeof value.playerId !== 'string') return null
  return {
    playerId: value.playerId,
    displayName: text(value.displayName),
    riotId: text(value.riotId),
    puuid: text(value.puuid),
    championId: finite(value.championId),
    championName: text(value.championName, 'Neznámý šampion'),
    teamId: finite(value.teamId),
    teamPosition: text(value.teamPosition),
    kills: finite(value.kills),
    deaths: finite(value.deaths),
    assists: finite(value.assists),
    goldEarned: finite(value.goldEarned),
    visionScore: finite(value.visionScore),
    totalDamageDealtToChampions: finite(value.totalDamageDealtToChampions),
    totalMinionsKilled: finite(value.totalMinionsKilled),
    neutralMinionsKilled: finite(value.neutralMinionsKilled),
    win: boolean(value.win),
  }
}

function normalizeMatch(value: unknown): MatchSummary | null {
  if (!isRecord(value) || typeof value.matchId !== 'string' || !Array.isArray(value.participants)) return null
  const participants = value.participants.map(normalizeParticipant)
  if (!participants.length || participants.some((participant) => !participant)) return null
  return {
    matchId: value.matchId,
    fetchedAt: text(value.fetchedAt),
    gameStartedAt: text(value.gameStartedAt),
    gameEndedAt: text(value.gameEndedAt),
    durationSeconds: finite(value.durationSeconds),
    gameMode: text(value.gameMode),
    queueId: finite(value.queueId),
    mapId: finite(value.mapId),
    gameVersion: text(value.gameVersion),
    participants: participants as MatchParticipantStats[],
  }
}

function normalizeGame(value: unknown, players: Player[]): ConfirmedGame | null {
  const draft = normalizeDraft(value, players, 10)
  if (!draft || !isRecord(value) || !Number.isInteger(value.number) || typeof value.confirmedAt !== 'string') return null
  const match = normalizeMatch(value.match)
  const syncRecord = isRecord(value.sync) ? value.sync : null
  const knownStatuses = ['untracked', 'pending', 'error', 'synced']
  const status = match
    ? 'synced'
    : syncRecord && knownStatuses.includes(text(syncRecord.status))
      ? text(syncRecord.status) as ConfirmedGame['sync']['status']
      : 'untracked'
  return {
    ...draft,
    number: value.number as number,
    confirmedAt: value.confirmedAt,
    origin: value.origin === 'riot-import' ? 'riot-import' : 'confirmed',
    match,
    sync: {
      status,
      lastAttemptAt: syncRecord && typeof syncRecord.lastAttemptAt === 'string' ? syncRecord.lastAttemptAt : null,
      message: syncRecord && typeof syncRecord.message === 'string' ? syncRecord.message : null,
    },
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

export function sanitizeState(value: unknown): AppState {
  if (!isRecord(value)) return DEFAULT_STATE
  const players = sanitizePlayers(value.players)
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
  const playerIds = new Set(players.map((player) => player.id))
  const requestedSelection = Array.isArray(value.selectedPlayerIds)
    ? value.selectedPlayerIds.filter((id): id is string => typeof id === 'string' && playerIds.has(id))
    : players.slice(0, 5).map((player) => player.id)
  const history = Array.isArray(value.history)
    ? value.history.map((game) => normalizeGame(game, players)).filter((game): game is ConfirmedGame => Boolean(game))
    : []
  return {
    schemaVersion: 3,
    players,
    selectedPlayerIds: [...new Set(requestedSelection)].slice(0, 5),
    draft: normalizeDraft(value.draft, players),
    history,
    settings,
    customDataset,
  }
}

export function loadState(storage: Pick<Storage, 'getItem'> = localStorage): AppState {
  try {
    const raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY)
    return raw ? sanitizeState(JSON.parse(raw)) : DEFAULT_STATE
  } catch {
    return DEFAULT_STATE
  }
}

export function saveState(state: AppState, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* Soukromý režim nebo plné úložiště nesmí shodit aplikaci. */ }
}

export interface HistoryBackup {
  schemaVersion: 2
  exportedAt: string
  history: ConfirmedGame[]
}

export function createHistoryBackup(history: ConfirmedGame[]): HistoryBackup {
  return { schemaVersion: 2, exportedAt: new Date().toISOString(), history }
}

export function validateHistoryBackup(value: unknown): ConfirmedGame[] {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2) || !Array.isArray(value.history)) {
    throw new Error('Soubor není platná záloha historie.')
  }
  const history = value.history.map((game) => normalizeGame(game, [])).filter((game): game is ConfirmedGame => Boolean(game))
  if (history.length !== value.history.length) throw new Error('Záloha obsahuje neplatný záznam hry.')
  return history
}
