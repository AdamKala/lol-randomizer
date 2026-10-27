import type { ConfirmedGame, MatchParticipantStats, MatchSummary, StatisticsFile } from '../types'
import { normalizeMatchSummary } from './match-summary'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function participantKey(participant: MatchParticipantStats): string {
  return participant.playerId || participant.puuid || participant.riotId.toLocaleLowerCase('en')
}

function participantQuality(participant: MatchParticipantStats): number {
  return (participant.detailedStats ? 10 : 0) + (participant.performanceScore > 0 ? 1 : 0) + (participant.puuid ? 1 : 0)
}

function mergeParticipants(current: MatchParticipantStats[], incoming: MatchParticipantStats[]): MatchParticipantStats[] {
  const participants = new Map<string, MatchParticipantStats>()
  for (const participant of [...current, ...incoming]) {
    const key = participantKey(participant)
    const existing = participants.get(key)
    if (!existing || participantQuality(participant) >= participantQuality(existing)) participants.set(key, participant)
  }
  return [...participants.values()].sort((left, right) => left.playerId.localeCompare(right.playerId, 'cs'))
}

export function mergeMatchSummaries(matches: MatchSummary[]): MatchSummary[] {
  const merged = new Map<string, MatchSummary>()
  for (const match of matches) {
    const existing = merged.get(match.matchId)
    if (!existing) {
      merged.set(match.matchId, match)
      continue
    }
    const existingTime = Date.parse(existing.fetchedAt)
    const incomingTime = Date.parse(match.fetchedAt)
    const latest = !Number.isFinite(existingTime) || (Number.isFinite(incomingTime) && incomingTime >= existingTime) ? match : existing
    merged.set(match.matchId, { ...latest, participants: mergeParticipants(existing.participants, match.participants) })
  }
  return [...merged.values()].sort((left, right) => Date.parse(left.gameStartedAt) - Date.parse(right.gameStartedAt) || left.matchId.localeCompare(right.matchId))
}

export function matchesFromHistory(history: ConfirmedGame[]): MatchSummary[] {
  return mergeMatchSummaries(history.flatMap((game) => game.match ? [game.match] : []))
}

export function cachedMatchCoverage(history: ConfirmedGame[]): Array<{ matchId: string; detailedPlayerIds: string[] }> {
  return matchesFromHistory(history).map((match) => ({
    matchId: match.matchId,
    detailedPlayerIds: match.participants.filter((participant) => participant.detailedStats).map((participant) => participant.playerId),
  }))
}

export function validateStatisticsMatches(value: unknown): MatchSummary[] {
  if (!Array.isArray(value) || value.length > 50_000) throw new Error('Statistiky musí obsahovat pole s nejvýše 50 000 zápasy.')
  const matches = value.map(normalizeMatchSummary)
  if (matches.some((match) => !match)) throw new Error('Soubor statistik obsahuje neplatný zápas.')
  return mergeMatchSummaries(matches as MatchSummary[])
}

export function parseStatisticsFile(value: unknown): StatisticsFile {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) {
    throw new Error('Soubor statistik nemá podporovaný formát.')
  }
  return { schemaVersion: 1, updatedAt: value.updatedAt, matches: validateStatisticsMatches(value.matches) }
}

export function createStatisticsFile(matches: unknown, updatedAt = new Date().toISOString()): StatisticsFile {
  return { schemaVersion: 1, updatedAt, matches: validateStatisticsMatches(matches) }
}
