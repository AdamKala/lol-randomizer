import type { MatchParticipantStats, MatchSummary } from '../types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback
const finite = (value: unknown, fallback = 0): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback

function normalizeParticipant(value: unknown, detailedStatsFallback: boolean): MatchParticipantStats | null {
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
    win: value.win === true,
    detailedStats: typeof value.detailedStats === 'boolean' ? value.detailedStats : detailedStatsFallback,
    performanceScore: finite(value.performanceScore),
    performanceRank: finite(value.performanceRank),
  }
}

export function normalizeMatchSummary(value: unknown): MatchSummary | null {
  if (!isRecord(value) || typeof value.matchId !== 'string' || !Array.isArray(value.participants)) return null
  const participants = value.participants.map((participant) => normalizeParticipant(participant, value.source !== 'opgg'))
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
    source: value.source === 'opgg' ? 'opgg' : 'riot-api',
    participants: participants as MatchParticipantStats[],
  }
}
