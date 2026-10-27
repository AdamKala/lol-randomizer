import { describe, expect, it } from 'vitest'
import type { ConfirmedGame, MatchParticipantStats } from '../types'
import { calculatePlayerStats } from './stats'

function participant(overrides: Partial<MatchParticipantStats> = {}): MatchParticipantStats {
  return { playerId: 'p1', displayName: 'Anna', riotId: 'Anna#EUW', puuid: 'puuid', championId: 103, championName: 'Ahri', teamId: 100, teamPosition: 'MIDDLE', kills: 10, deaths: 2, assists: 8, goldEarned: 12000, visionScore: 20, totalDamageDealtToChampions: 24000, totalMinionsKilled: 180, neutralMinionsKilled: 10, win: true, ...overrides }
}

function syncedGame(id: string, stats: MatchParticipantStats): ConfirmedGame {
  return { id, createdAt: '2026-10-27T10:00:00.000Z', confirmedAt: '2026-10-27T10:01:00.000Z', patch: 'test', number: 1, slots: [], sync: { status: 'synced', lastAttemptAt: null, message: null }, match: { matchId: `EUN1_${id}`, fetchedAt: '2026-10-27T11:00:00.000Z', gameStartedAt: '2026-10-27T10:05:00.000Z', gameEndedAt: '2026-10-27T10:35:00.000Z', durationSeconds: 1800, gameMode: 'CLASSIC', queueId: 420, mapId: 11, gameVersion: 'test', participants: [stats] } }
}

describe('statistiky', () => {
  it('agreguje skutečné Riot výsledky a ignoruje nesynchronizované hry', () => {
    const pending = { ...syncedGame('pending', participant()), match: null, sync: { status: 'pending' as const, lastAttemptAt: null, message: null } }
    const stats = calculatePlayerStats([
      syncedGame('1', participant()),
      syncedGame('2', participant({ championName: 'Lux', kills: 4, deaths: 4, assists: 6, win: false })),
      syncedGame('3', participant()),
      pending,
    ])
    expect(stats).toHaveLength(1)
    expect(stats[0]).toMatchObject({ games: 3, wins: 2, losses: 1, kills: 24, deaths: 8, assists: 22, favoriteChampion: 'Ahri' })
  })

  it('u OP.GG dat nepočítá chybějící damage a vision jako nulu', () => {
    const imported = syncedGame('opgg', participant({ totalDamageDealtToChampions: 0, visionScore: 0 }))
    imported.match!.source = 'opgg'
    expect(calculatePlayerStats([imported])[0]).toMatchObject({ damageSamples: 0, visionSamples: 0, cs: 190 })
  })
})
