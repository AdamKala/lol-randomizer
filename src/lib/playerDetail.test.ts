import { describe, expect, it } from 'vitest'
import type { ConfirmedGame, MatchParticipantStats } from '../types'
import { buildPlayerDetail } from './playerDetail'

function game(id: string, championName: string, win: boolean, performanceRank: number): ConfirmedGame {
  const participant: MatchParticipantStats = {
    playerId: 'p1', displayName: 'Anna', riotId: 'Anna#EUW', puuid: 'puuid', championId: championName === 'Ahri' ? 103 : 99, championName,
    teamId: 100, teamPosition: 'MIDDLE', kills: 8, deaths: 2, assists: 10, goldEarned: 12000, visionScore: 24,
    totalDamageDealtToChampions: 24000, totalMinionsKilled: 180, neutralMinionsKilled: 10, win, detailedStats: true,
    performanceScore: 8, performanceRank,
  }
  return {
    id, createdAt: `2026-10-2${id}T10:00:00.000Z`, confirmedAt: `2026-10-2${id}T10:00:00.000Z`, patch: '16.21', number: Number(id), origin: 'opgg-import',
    slots: [{ playerId: 'p1', player: 'Anna', riotId: 'Anna#EUW', role: 'MID', champion: { id: participant.championId, name: championName, slug: championName, role: 'MID', pickRate: 1, games: 1 } }],
    sync: { status: 'synced', lastAttemptAt: null, message: null },
    match: { matchId: id, fetchedAt: '2026-10-27T11:00:00.000Z', gameStartedAt: `2026-10-2${id}T10:00:00.000Z`, gameEndedAt: `2026-10-2${id}T10:30:00.000Z`, durationSeconds: 1800, gameMode: 'Ranked', queueId: 420, mapId: 11, gameVersion: '16.21', participants: [participant] },
  }
}

describe('detail hráče', () => {
  it('agreguje formu, role a statistiky jednotlivých šampionů', () => {
    const detail = buildPlayerDetail([game('1', 'Ahri', true, 1), game('2', 'Ahri', false, 4), game('3', 'Lux', true, 2)], { id: 'p1', name: 'Anna', riotId: 'Anna#EUW' })
    expect(detail).toMatchObject({ games: 3, wins: 2, losses: 1, kills: 24, deaths: 6, assists: 30, damage: 72000, gold: 36000, mvpCount: 1, topThreeCount: 2 })
    expect(detail.champions[0]).toMatchObject({ championName: 'Ahri', games: 2, wins: 1, damage: 48000 })
    expect(detail.roles).toEqual([{ role: 'MID', games: 3, wins: 2 }])
    expect(detail.strengths).toHaveLength(3)
    expect(detail.matches.map((match) => match.gameId)).toEqual(['3', '2', '1'])
  })

  it('vrátí prázdný profil i hráči bez načtených her', () => {
    expect(buildPlayerDetail([], { id: 'p1', name: 'Anna', riotId: '' })).toMatchObject({ displayName: 'Anna', games: 0, champions: [], matches: [], strengths: [] })
  })
})
