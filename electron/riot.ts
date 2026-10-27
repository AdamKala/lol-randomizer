import { app, safeStorage } from 'electron'
import { chmod, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { MatchParticipantStats, MatchSummary, MatchSyncRequest, MatchSyncResult, RecentMatchesImportRequest, RecentMatchesImportResult, RiotApiStatus } from '../src/types'

const ROUTING = 'europe'
const SECRET_FILE = 'riot-api-key.json'
const REQUEST_SPACING_MS = 75

let requestQueue: Promise<void> = Promise.resolve()
let lastRequestStartedAt = 0
let blockedUntil = 0

interface StoredSecret {
  protected: boolean
  value: string
}

interface RiotAccount {
  puuid: string
  gameName?: string
  tagLine?: string
}

interface RiotParticipant {
  puuid?: string
  championId?: number
  championName?: string
  teamId?: number
  teamPosition?: string
  individualPosition?: string
  kills?: number
  deaths?: number
  assists?: number
  goldEarned?: number
  visionScore?: number
  totalDamageDealtToChampions?: number
  totalMinionsKilled?: number
  neutralMinionsKilled?: number
  win?: boolean
}

interface RiotMatch {
  metadata?: { matchId?: string }
  info?: {
    gameCreation?: number
    gameStartTimestamp?: number
    gameEndTimestamp?: number
    gameDuration?: number
    gameMode?: string
    queueId?: number
    mapId?: number
    gameVersion?: string
    participants?: RiotParticipant[]
  }
}

function secretPath(): string {
  return join(app.getPath('userData'), SECRET_FILE)
}

async function readApiKey(): Promise<string | null> {
  try {
    const stored = JSON.parse(await readFile(secretPath(), 'utf8')) as StoredSecret
    if (!stored.value) return null
    if (stored.protected) {
      if (!await safeStorage.isAsyncEncryptionAvailable()) return null
      return (await safeStorage.decryptStringAsync(Buffer.from(stored.value, 'base64'))).result
    }
    return Buffer.from(stored.value, 'base64').toString('utf8')
  } catch {
    return null
  }
}

export async function getRiotApiStatus(): Promise<RiotApiStatus> {
  return { hasApiKey: Boolean(await readApiKey()), protectedStorage: await safeStorage.isAsyncEncryptionAvailable() }
}

export async function setRiotApiKey(value: unknown): Promise<RiotApiStatus> {
  if (typeof value !== 'string') throw new Error('API klíč musí být text.')
  const apiKey = value.trim()
  if (!apiKey) {
    await unlink(secretPath()).catch(() => undefined)
    return getRiotApiStatus()
  }
  if (!apiKey.startsWith('RGAPI-') || apiKey.length > 256) throw new Error('Riot API klíč nemá očekávaný formát RGAPI-…')
  const protectedStorage = await safeStorage.isAsyncEncryptionAvailable()
  const encoded = protectedStorage
    ? (await safeStorage.encryptStringAsync(apiKey)).toString('base64')
    : Buffer.from(apiKey, 'utf8').toString('base64')
  await writeFile(secretPath(), JSON.stringify({ protected: protectedStorage, value: encoded } satisfies StoredSecret), { mode: 0o600 })
  await chmod(secretPath(), 0o600).catch(() => undefined)
  return getRiotApiStatus()
}

function splitRiotId(riotId: string): { gameName: string; tagLine: string } {
  const separator = riotId.lastIndexOf('#')
  const gameName = riotId.slice(0, separator).trim()
  const tagLine = riotId.slice(separator + 1).trim()
  if (separator < 1 || !gameName || !tagLine || gameName.length > 64 || tagLine.length > 16) {
    throw new Error(`Riot ID „${riotId}“ musí mít formát Jméno#TAG.`)
  }
  return { gameName, tagLine }
}

function validateRequest(value: unknown): asserts value is MatchSyncRequest {
  if (!value || typeof value !== 'object') throw new Error('Neplatný požadavek na synchronizaci.')
  const request = value as Partial<MatchSyncRequest>
  if (typeof request.gameId !== 'string' || typeof request.confirmedAt !== 'string' || !Number.isFinite(Date.parse(request.confirmedAt))) {
    throw new Error('Potvrzená hra nemá platné ID nebo čas.')
  }
  if (!Array.isArray(request.players) || request.players.length < 1 || request.players.length > 5) {
    throw new Error('Synchronizovat lze jednu až pět osob.')
  }
  for (const player of request.players) {
    if (!player || typeof player.playerId !== 'string' || typeof player.displayName !== 'string' || typeof player.riotId !== 'string') {
      throw new Error('Neplatná data hráče pro synchronizaci.')
    }
    splitRiotId(player.riotId)
  }
  if (!Array.isArray(request.excludedMatchIds) || request.excludedMatchIds.some((id) => typeof id !== 'string')) {
    throw new Error('Neplatný seznam již uložených zápasů.')
  }
}

function validateImportRequest(value: unknown): asserts value is RecentMatchesImportRequest {
  if (!value || typeof value !== 'object') throw new Error('Neplatný požadavek na import historie.')
  const request = value as Partial<RecentMatchesImportRequest>
  if (!Array.isArray(request.players) || request.players.length < 1 || request.players.length > 10) {
    throw new Error('Najednou lze načíst historii jednoho až deseti hráčů.')
  }
  for (const player of request.players) {
    if (!player || typeof player.playerId !== 'string' || typeof player.displayName !== 'string' || typeof player.riotId !== 'string') {
      throw new Error('Neplatná data hráče pro import historie.')
    }
    splitRiotId(player.riotId)
  }
  if (!Array.isArray(request.excludedMatchIds) || request.excludedMatchIds.some((id) => typeof id !== 'string')) {
    throw new Error('Neplatný seznam již uložených zápasů.')
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function queuedFetch(url: string, apiKey: string): Promise<Response> {
  const result = requestQueue.then(async () => {
    const delay = Math.max(0, blockedUntil - Date.now(), REQUEST_SPACING_MS - (Date.now() - lastRequestStartedAt))
    if (delay) await wait(delay)
    lastRequestStartedAt = Date.now()
    const response = await fetch(url, {
      headers: { 'X-Riot-Token': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
    if (response.status === 429) {
      const retrySeconds = Math.max(1, Number(response.headers.get('retry-after')) || 1)
      blockedUntil = Date.now() + retrySeconds * 1000
    }
    return response
  })
  requestQueue = result.then(() => undefined, () => undefined)
  return result
}

async function riotFetch<T>(path: string, apiKey: string, attempt = 0): Promise<T> {
  const response = await queuedFetch(`https://${ROUTING}.api.riotgames.com${path}`, apiKey)
  if (response.ok) return response.json() as Promise<T>
  const retryAfter = response.headers.get('retry-after')
  if (response.status === 429 && attempt < 2) {
    await wait(Math.max(1, Number(retryAfter) || 1) * 1000)
    return riotFetch<T>(path, apiKey, attempt + 1)
  }
  if (response.status === 401) throw new Error('Riot API klíč chybí nebo nebyl přijat.')
  if (response.status === 403) throw new Error('Riot API klíč je neplatný nebo expiroval. Vývojový klíč platí pouze 24 hodin.')
  if (response.status === 404) throw new Error('Riot ID nebo zápas nebyl nalezen na evropském clusteru.')
  if (response.status === 429) throw new Error(`Riot API limit je vyčerpaný. Zkus synchronizaci za ${retryAfter ?? 'několik'} sekund.`)
  throw new Error(`Riot API je dočasně nedostupné (HTTP ${response.status}).`)
}

function number(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function normalizeMatch(match: RiotMatch, players: MatchSyncRequest['players'], accounts: Map<string, RiotAccount>, requireAllPlayers: boolean): MatchSummary | null {
  const info = match.info
  const participants = info?.participants
  const matchId = match.metadata?.matchId
  if (!info || !participants || !matchId) return null
  const tracked: MatchParticipantStats[] = []
  for (const player of players) {
    const account = accounts.get(player.playerId)
    const participant = participants.find((candidate) => candidate.puuid === account?.puuid)
    if (!account || !participant) {
      if (requireAllPlayers) return null
      continue
    }
    tracked.push({
      playerId: player.playerId,
      displayName: player.displayName,
      riotId: player.riotId,
      puuid: account.puuid,
      championId: number(participant.championId),
      championName: participant.championName || 'Neznámý šampion',
      teamId: number(participant.teamId),
      teamPosition: participant.teamPosition || participant.individualPosition || '',
      kills: number(participant.kills),
      deaths: number(participant.deaths),
      assists: number(participant.assists),
      goldEarned: number(participant.goldEarned),
      visionScore: number(participant.visionScore),
      totalDamageDealtToChampions: number(participant.totalDamageDealtToChampions),
      totalMinionsKilled: number(participant.totalMinionsKilled),
      neutralMinionsKilled: number(participant.neutralMinionsKilled),
      win: participant.win === true,
    })
  }
  if (!tracked.length) return null
  const started = number(info.gameStartTimestamp) || number(info.gameCreation)
  const ended = number(info.gameEndTimestamp) || started + number(info.gameDuration) * 1000
  return {
    matchId,
    fetchedAt: new Date().toISOString(),
    gameStartedAt: new Date(started).toISOString(),
    gameEndedAt: new Date(ended).toISOString(),
    durationSeconds: number(info.gameDuration),
    gameMode: info.gameMode || '',
    queueId: number(info.queueId),
    mapId: number(info.mapId),
    gameVersion: info.gameVersion || '',
    participants: tracked,
  }
}

export async function syncRiotMatch(value: unknown): Promise<MatchSyncResult> {
  validateRequest(value)
  const request = value
  const apiKey = await readApiKey()
  if (!apiKey) throw new Error('Nejdřív v nastavení ulož Riot API klíč.')

  const accounts = new Map<string, RiotAccount>()
  for (const player of request.players) {
    const { gameName, tagLine } = splitRiotId(player.riotId)
    const account = await riotFetch<RiotAccount>(
      `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      apiKey,
    )
    if (!account.puuid) throw new Error(`Riot účet ${player.riotId} nevrátil platné PUUID.`)
    accounts.set(player.playerId, account)
  }

  const firstAccount = accounts.get(request.players[0].playerId)!
  const confirmedSeconds = Math.floor(Date.parse(request.confirmedAt) / 1000)
  const matchIds = await riotFetch<string[]>(
    `/lol/match/v5/matches/by-puuid/${encodeURIComponent(firstAccount.puuid)}/ids?startTime=${Math.max(0, confirmedSeconds - 300)}&start=0&count=20`,
    apiKey,
  )
  const excluded = new Set(request.excludedMatchIds)
  const confirmedAt = Date.parse(request.confirmedAt)
  const latestAllowedStart = confirmedAt + 12 * 60 * 60 * 1000

  for (const matchId of matchIds) {
    if (excluded.has(matchId)) continue
    const rawMatch = await riotFetch<RiotMatch>(`/lol/match/v5/matches/${encodeURIComponent(matchId)}`, apiKey)
    const startedAt = number(rawMatch.info?.gameStartTimestamp) || number(rawMatch.info?.gameCreation)
    if (startedAt < confirmedAt - 5 * 60 * 1000 || startedAt > latestAllowedStart) continue
    const normalized = normalizeMatch(rawMatch, request.players, accounts, true)
    if (normalized) return { kind: 'matched', match: normalized }
  }

  return { kind: 'pending', message: 'Společná dokončená hra zatím v Riot match history není. Aplikace to zkusí znovu automaticky.' }
}

export async function importRecentRiotMatches(value: unknown): Promise<RecentMatchesImportResult> {
  validateImportRequest(value)
  const request = value
  const apiKey = await readApiKey()
  if (!apiKey) throw new Error('Nejdřív v nastavení ulož Riot API klíč.')

  const accounts = new Map<string, RiotAccount>()
  const matchIds = new Set<string>()
  const excluded = new Set(request.excludedMatchIds)

  for (const player of request.players) {
    try {
      const { gameName, tagLine } = splitRiotId(player.riotId)
      const account = await riotFetch<RiotAccount>(
        `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
        apiKey,
      )
      if (!account.puuid) throw new Error(`Riot účet ${player.riotId} nevrátil platné PUUID.`)
      accounts.set(player.playerId, account)
      const recentIds = await riotFetch<string[]>(
        `/lol/match/v5/matches/by-puuid/${encodeURIComponent(account.puuid)}/ids?start=0&count=10`,
        apiKey,
      )
      for (const matchId of recentIds) if (!excluded.has(matchId)) matchIds.add(matchId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Riot účet se nepodařilo načíst.'
      throw new Error(`${player.displayName} (${player.riotId}): ${message}`)
    }
  }

  const matches: MatchSummary[] = []
  for (const matchId of matchIds) {
    const rawMatch = await riotFetch<RiotMatch>(`/lol/match/v5/matches/${encodeURIComponent(matchId)}`, apiKey)
    const normalized = normalizeMatch(rawMatch, request.players, accounts, false)
    if (normalized) matches.push(normalized)
  }

  matches.sort((left, right) => Date.parse(left.gameStartedAt) - Date.parse(right.gameStartedAt))
  return { matches, playerCount: request.players.length }
}
