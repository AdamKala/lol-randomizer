import type { MatchParticipantStats, MatchRegion, MatchSummary, MatchSyncRequest, MatchSyncResult, RecentMatchesImportRequest, RecentMatchesImportResult } from '../src/types'

interface PublicPlayerMatch {
  rawMatchId: string
  gameStartedAt: string
  queueType: string
  championName: string
  kills: number
  deaths: number
  assists: number
  cs: number
  win: boolean
  opScore: number
  opScoreRank: number
}

type TrackedPlayer = MatchSyncRequest['players'][number]

const PROFILE_LIMIT_BYTES = 5_000_000
const DETAIL_LIMIT_BYTES = 8_000_000
const USER_AGENT = 'LoL-Randomizer/1.4.1 (+https://github.com/AdamKala/lol-randomizer)'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0
}

function validateRegion(value: unknown): asserts value is MatchRegion {
  if (value !== 'eune' && value !== 'euw') throw new Error('Historie podporuje region EUNE nebo EUW.')
}

function validatePlayers(players: unknown, maximum: number): asserts players is MatchSyncRequest['players'] {
  if (!Array.isArray(players) || players.length < 1 || players.length > maximum) throw new Error(`Načíst lze historii jednoho až ${maximum} hráčů.`)
  for (const player of players) {
    if (!isRecord(player) || typeof player.playerId !== 'string' || typeof player.displayName !== 'string' || typeof player.riotId !== 'string' || !player.riotId.includes('#')) {
      throw new Error('Každý načítaný hráč musí mít platné Riot ID ve formátu Jméno#TAG.')
    }
  }
}

function validateSyncRequest(value: unknown): asserts value is MatchSyncRequest {
  if (!isRecord(value) || typeof value.gameId !== 'string' || typeof value.confirmedAt !== 'string' || !Number.isFinite(Date.parse(value.confirmedAt))) throw new Error('Neplatný požadavek na synchronizaci zápasu.')
  validateRegion(value.region)
  validatePlayers(value.players, 5)
  if (!Array.isArray(value.excludedMatchIds) || value.excludedMatchIds.some((id) => typeof id !== 'string')) throw new Error('Neplatný seznam uložených zápasů.')
}

function validateImportRequest(value: unknown): asserts value is RecentMatchesImportRequest {
  if (!isRecord(value)) throw new Error('Neplatný požadavek na import historie.')
  validateRegion(value.region)
  validatePlayers(value.players, 10)
  if (!Array.isArray(value.excludedMatchIds) || value.excludedMatchIds.some((id) => typeof id !== 'string')) throw new Error('Neplatný seznam uložených zápasů.')
}

function splitRiotId(riotId: string): { gameName: string; tagLine: string } {
  const separator = riotId.lastIndexOf('#')
  const gameName = riotId.slice(0, separator).trim()
  const tagLine = riotId.slice(separator + 1).trim()
  if (separator < 1 || !gameName || !tagLine || gameName.length > 64 || tagLine.length > 16) throw new Error(`Riot ID „${riotId}“ musí mít formát Jméno#TAG.`)
  return { gameName, tagLine }
}

function propertyMap(value: unknown): Map<string, unknown> {
  const result = new Map<string, unknown>()
  if (!Array.isArray(value)) return result
  for (const property of value) {
    if (isRecord(property) && typeof property.name === 'string') result.set(property.name, property.value)
  }
  return result
}

function jsonLdGraphs(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = []
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const match of html.matchAll(pattern)) {
    try {
      const parsed: unknown = JSON.parse(match[1])
      if (isRecord(parsed)) {
        nodes.push(parsed)
        if (Array.isArray(parsed['@graph'])) nodes.push(...parsed['@graph'].filter(isRecord))
      }
    } catch {
      // Ostatní JSON-LD bloky nesmí zneplatnit použitelný seznam zápasů.
    }
  }
  return nodes
}

export function parseOpggRecentMatches(html: string): PublicPlayerMatch[] {
  const list = jsonLdGraphs(html).find((node) => node['@type'] === 'ItemList' && (text(node['@id']).endsWith('#recent-games') || text(node.name).toLocaleLowerCase('en').includes('recent match')))
  if (!list || !Array.isArray(list.itemListElement)) throw new Error('OP.GG profil neobsahuje čitelnou historii zápasů. Zkontroluj Riot ID a region.')
  const matches: PublicPlayerMatch[] = []
  for (const element of list.itemListElement.slice(0, 10)) {
    if (!isRecord(element) || !isRecord(element.item)) continue
    const item = element.item
    const properties = propertyMap(item.additionalProperty)
    const result = text(properties.get('result')).toUpperCase()
    const rawMatchId = text(properties.get('matchId'))
    const gameStartedAt = text(item.startTime)
    const championName = text(properties.get('champion'))
    if (!rawMatchId || !championName || !Number.isFinite(Date.parse(gameStartedAt)) || (result !== 'WIN' && result !== 'LOSE')) continue
    matches.push({
      rawMatchId,
      gameStartedAt,
      queueType: text(properties.get('queueType')),
      championName,
      kills: number(properties.get('kills')),
      deaths: number(properties.get('deaths')),
      assists: number(properties.get('assists')),
      cs: number(properties.get('cs')),
      win: result === 'WIN',
      opScore: number(properties.get('opScore')),
      opScoreRank: number(properties.get('opScoreRank')),
    })
  }
  if (!matches.length) throw new Error('OP.GG profil nemá žádné dokončené zápasy se statistikami.')
  return matches
}

async function fetchPlayerMatches(player: TrackedPlayer, region: MatchRegion): Promise<PublicPlayerMatch[]> {
  const { gameName, tagLine } = splitRiotId(player.riotId)
  const url = `https://op.gg/lol/summoners/${region}/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`
  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.8', 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000),
    })
    if (!response.ok) throw new Error(`OP.GG vrátil HTTP ${response.status}.`)
    const length = Number(response.headers.get('content-length'))
    if (Number.isFinite(length) && length > PROFILE_LIMIT_BYTES) throw new Error('OP.GG profil je neočekávaně velký.')
    const html = await response.text()
    if (html.length > PROFILE_LIMIT_BYTES) throw new Error('OP.GG profil je neočekávaně velký.')
    return parseOpggRecentMatches(html)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Profil se nepodařilo načíst.'
    throw new Error(`${player.displayName} (${player.riotId}, ${region.toUpperCase()}): ${message}`)
  }
}

function queueInfo(queueType: string): { gameMode: string; queueId: number; mapId: number } {
  switch (queueType.toUpperCase()) {
    case 'SOLORANKED': return { gameMode: 'Ranked Solo/Duo', queueId: 420, mapId: 11 }
    case 'FLEXRANKED': return { gameMode: 'Ranked Flex', queueId: 440, mapId: 11 }
    case 'ARAM': return { gameMode: 'ARAM', queueId: 450, mapId: 12 }
    case 'ARENA': return { gameMode: 'Arena', queueId: 1700, mapId: 30 }
    default: return { gameMode: queueType || 'League of Legends', queueId: 0, mapId: 0 }
  }
}

function publicMatchId(region: MatchRegion, rawMatchId: string): string {
  return `OPGG_${region}_${rawMatchId}`
}

function participantFor(player: TrackedPlayer, match: PublicPlayerMatch): MatchParticipantStats {
  return {
    playerId: player.playerId,
    displayName: player.displayName,
    riotId: player.riotId,
    puuid: '',
    championId: 0,
    championName: match.championName,
    teamId: 0,
    teamPosition: '',
    kills: match.kills,
    deaths: match.deaths,
    assists: match.assists,
    goldEarned: 0,
    visionScore: 0,
    totalDamageDealtToChampions: 0,
    totalMinionsKilled: match.cs,
    neutralMinionsKilled: 0,
    win: match.win,
    detailedStats: false,
    performanceScore: match.opScore,
    performanceRank: match.opScoreRank,
  }
}

function normalizedRiotId(value: string): string {
  const normalized = value.normalize('NFKC').trim()
  const separator = normalized.lastIndexOf('#')
  if (separator < 0) return normalized.toLocaleLowerCase('en')
  return `${normalized.slice(0, separator).trim()}#${normalized.slice(separator + 1).trim()}`.toLocaleLowerCase('en')
}

function collectDetailedParticipants(html: string): Record<string, unknown>[] {
  const participants = new Map<string, Record<string, unknown>>()
  const pattern = /<script>self\.__next_f\.push\(([\s\S]*?)\)<\/script>/g
  const chunks: string[] = []
  for (const match of html.matchAll(pattern)) {
    try {
      const payload: unknown = JSON.parse(match[1])
      if (Array.isArray(payload) && typeof payload[1] === 'string') chunks.push(payload[1])
    } catch {
      // Neplatný Flight chunk přeskočíme; další může stále obsahovat detail účastníků.
    }
  }
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (!isRecord(value)) return
    const stats = value.stats
    const summoner = value.summoner
    if (isRecord(stats) && isRecord(summoner) && typeof value.participant_id === 'number' && stats.total_damage_dealt_to_champions != null) {
      const key = `${text(summoner.game_name)}#${text(summoner.tagline)}`
      if (key !== '#' && !participants.has(normalizedRiotId(key))) participants.set(normalizedRiotId(key), value)
    }
    for (const item of Object.values(value)) visit(item)
  }
  for (const chunk of chunks) {
    for (const line of chunk.split('\n')) {
      const separator = line.indexOf(':')
      if (separator < 0) continue
      try { visit(JSON.parse(line.slice(separator + 1))) } catch { /* Flight řádky nejsou všechny samostatný JSON. */ }
    }
  }
  return [...participants.values()]
}

export function parseOpggMatchDetail(html: string, region: MatchRegion, rawMatchId: string, players: TrackedPlayer[]): MatchSummary {
  const action = jsonLdGraphs(html).find((node) => node['@type'] === 'PlayGameAction' && text(propertyMap(node.additionalProperty).get('matchId')) === rawMatchId)
  if (!action) throw new Error('Detail OP.GG neobsahuje metadata zápasu.')
  const properties = propertyMap(action.additionalProperty)
  const tracked = new Map(players.map((player) => [normalizedRiotId(player.riotId), player]))
  const participants: MatchParticipantStats[] = []
  for (const value of collectDetailedParticipants(html)) {
    const summoner = isRecord(value.summoner) ? value.summoner : {}
    const stats = isRecord(value.stats) ? value.stats : {}
    const champion = isRecord(value.champion) ? value.champion : {}
    const riotId = `${text(summoner.game_name)}#${text(summoner.tagline)}`
    const player = tracked.get(normalizedRiotId(riotId))
    if (!player || participants.some((participant) => participant.playerId === player.playerId)) continue
    participants.push({
      playerId: player.playerId,
      displayName: player.displayName,
      riotId: player.riotId,
      puuid: text(summoner.puuid),
      championId: number(value.champion_id),
      championName: text(champion.name, 'Neznámý šampion'),
      teamId: text(value.team_key).toUpperCase() === 'BLUE' ? 100 : text(value.team_key).toUpperCase() === 'RED' ? 200 : 0,
      teamPosition: text(value.position),
      kills: number(stats.kill),
      deaths: number(stats.death),
      assists: number(stats.assist),
      goldEarned: number(stats.gold_earned),
      visionScore: number(stats.vision_score),
      totalDamageDealtToChampions: number(stats.total_damage_dealt_to_champions),
      totalMinionsKilled: number(stats.minion_kill),
      neutralMinionsKilled: number(stats.neutral_minion_kill),
      win: text(stats.result).toUpperCase() === 'WIN',
      detailedStats: true,
      performanceScore: number(stats.op_score),
      performanceRank: number(stats.op_score_rank),
    })
  }
  if (!participants.length) throw new Error('V detailu OP.GG nebyl nalezen žádný sledovaný hráč.')
  const queue = queueInfo(text(properties.get('queueType')))
  const gameStartedAt = text(action.startTime)
  const durationSeconds = number(properties.get('durationSeconds'))
  const startedAt = Date.parse(gameStartedAt)
  return {
    matchId: publicMatchId(region, rawMatchId),
    fetchedAt: new Date().toISOString(),
    gameStartedAt,
    gameEndedAt: Number.isFinite(startedAt) && durationSeconds > 0 ? new Date(startedAt + durationSeconds * 1000).toISOString() : gameStartedAt,
    durationSeconds,
    ...queue,
    gameVersion: text(properties.get('patch')),
    source: 'opgg',
    participants,
  }
}

async function fetchMatchDetail(player: TrackedPlayer, match: PublicPlayerMatch, region: MatchRegion, players: TrackedPlayer[]): Promise<MatchSummary> {
  const { gameName, tagLine } = splitRiotId(player.riotId)
  const timestamp = Date.parse(match.gameStartedAt)
  if (!Number.isFinite(timestamp)) throw new Error('Zápas nemá platný čas začátku.')
  const url = `https://op.gg/lol/summoners/${region}/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}/matches/${encodeURIComponent(match.rawMatchId)}/${timestamp}`
  const response = await fetch(url, {
    headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.8', 'User-Agent': USER_AGENT },
    redirect: 'follow',
    signal: AbortSignal.timeout(25_000),
  })
  if (!response.ok) throw new Error(`Detail OP.GG vrátil HTTP ${response.status}.`)
  const length = Number(response.headers.get('content-length'))
  if (Number.isFinite(length) && length > DETAIL_LIMIT_BYTES) throw new Error('Detail OP.GG je neočekávaně velký.')
  const html = await response.text()
  if (html.length > DETAIL_LIMIT_BYTES) throw new Error('Detail OP.GG je neočekávaně velký.')
  return parseOpggMatchDetail(html, region, match.rawMatchId, players)
}

function summaryFor(region: MatchRegion, player: TrackedPlayer, match: PublicPlayerMatch): MatchSummary {
  const queue = queueInfo(match.queueType)
  return {
    matchId: publicMatchId(region, match.rawMatchId),
    fetchedAt: new Date().toISOString(),
    gameStartedAt: match.gameStartedAt,
    gameEndedAt: match.gameStartedAt,
    durationSeconds: 0,
    ...queue,
    gameVersion: '',
    source: 'opgg',
    participants: [participantFor(player, match)],
  }
}

function mergeProfileMatches(profiles: Array<{ player: TrackedPlayer; matches: PublicPlayerMatch[] }>, region: MatchRegion, excludedMatchIds: string[]): MatchSummary[] {
  const excluded = new Set(excludedMatchIds)
  const summaries = new Map<string, MatchSummary>()
  for (const profile of profiles) {
    for (const match of profile.matches) {
      const matchId = publicMatchId(region, match.rawMatchId)
      if (excluded.has(matchId)) continue
      const existing = summaries.get(matchId)
      if (existing) existing.participants.push(participantFor(profile.player, match))
      else summaries.set(matchId, summaryFor(region, profile.player, match))
    }
  }
  return [...summaries.values()].sort((left, right) => Date.parse(left.gameStartedAt) - Date.parse(right.gameStartedAt))
}

async function enrichProfileMatches(profiles: Array<{ player: TrackedPlayer; matches: PublicPlayerMatch[] }>, region: MatchRegion, excludedMatchIds: string[]): Promise<MatchSummary[]> {
  const summaries = mergeProfileMatches(profiles, region, excludedMatchIds)
  const references = new Map<string, { player: TrackedPlayer; match: PublicPlayerMatch }>()
  for (const profile of profiles) for (const match of profile.matches) {
    if (!references.has(match.rawMatchId)) references.set(match.rawMatchId, { player: profile.player, match })
  }
  const detailed = new Map<string, MatchSummary>()
  let cursor = 0
  const workers = Array.from({ length: Math.min(3, summaries.length) }, async () => {
    while (cursor < summaries.length) {
      const summary = summaries[cursor++]
      const rawMatchId = summary.matchId.slice(`OPGG_${region}_`.length)
      const reference = references.get(rawMatchId)
      if (!reference) continue
      try {
        detailed.set(summary.matchId, await fetchMatchDetail(reference.player, reference.match, region, profiles.map((profile) => profile.player)))
      } catch {
        // Profilový souhrn s KDA a OP skóre je stále užitečný fallback.
      }
    }
  })
  await Promise.all(workers)
  return summaries.map((summary) => detailed.get(summary.matchId) ?? summary)
}

export async function importRecentPublicMatches(value: unknown): Promise<RecentMatchesImportResult> {
  validateImportRequest(value)
  const profiles: Array<{ player: TrackedPlayer; matches: PublicPlayerMatch[] }> = []
  for (const player of value.players) profiles.push({ player, matches: await fetchPlayerMatches(player, value.region) })
  return { matches: await enrichProfileMatches(profiles, value.region, value.excludedMatchIds), playerCount: value.players.length }
}

export async function syncPublicMatch(value: unknown): Promise<MatchSyncResult> {
  validateSyncRequest(value)
  const profiles: Array<{ player: TrackedPlayer; matches: PublicPlayerMatch[] }> = []
  for (const player of value.players) profiles.push({ player, matches: await fetchPlayerMatches(player, value.region) })
  const commonIds = profiles[0].matches.map((match) => match.rawMatchId).filter((matchId) => profiles.every((profile) => profile.matches.some((match) => match.rawMatchId === matchId)))
  const excluded = new Set(value.excludedMatchIds)
  const confirmedAt = Date.parse(value.confirmedAt)
  const latestAllowedStart = confirmedAt + 12 * 60 * 60 * 1000
  const matchedId = commonIds
    .filter((matchId) => !excluded.has(publicMatchId(value.region, matchId)))
    .map((matchId) => ({ matchId, startedAt: Date.parse(profiles[0].matches.find((match) => match.rawMatchId === matchId)!.gameStartedAt) }))
    .filter(({ startedAt }) => startedAt >= confirmedAt - 5 * 60 * 1000 && startedAt <= latestAllowedStart)
    .sort((left, right) => left.startedAt - right.startedAt)[0]?.matchId
  if (!matchedId) return { kind: 'pending', message: 'Společná hra zatím na OP.GG není. Aplikace to zkusí znovu automaticky.' }
  const selectedProfiles = profiles.map((profile) => ({ player: profile.player, matches: profile.matches.filter((match) => match.rawMatchId === matchedId) }))
  const match = (await enrichProfileMatches(selectedProfiles, value.region, []))[0]
  return match ? { kind: 'matched', match } : { kind: 'pending', message: 'Společnou hru se z OP.GG nepodařilo sestavit.' }
}
