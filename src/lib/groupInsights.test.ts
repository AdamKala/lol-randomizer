import { describe, expect, it } from 'vitest'
import type { ConfirmedGame, MatchParticipantStats, Role } from '../types'
import { buildGroupInsights } from './groupInsights'

function participant(playerId: string, displayName: string, championName: string, position: string, win: boolean): MatchParticipantStats {
  return { playerId, displayName, riotId: `${displayName}#EUW`, puuid: playerId, championId: 1, championName, teamId: 100, teamPosition: position, kills: 5, deaths: 3, assists: 8, goldEarned: 10000, visionScore: 20, totalDamageDealtToChampions: 20000, totalMinionsKilled: 150, neutralMinionsKilled: 0, win, detailedStats: true, performanceScore: 7, performanceRank: 3 }
}

function game(id: string, win: boolean, secondRole: Role = 'JUNGLE', secondPlayer = { id: 'p2', name: 'Bob' }): ConfirmedGame {
  const first = participant('p1', 'Anna', 'Ahri', 'MID', win)
  const second = participant(secondPlayer.id, secondPlayer.name, id === '3' ? 'Lee Sin' : 'Vi', secondRole, win)
  return { id, createdAt: '2026-10-27T10:00:00.000Z', confirmedAt: '2026-10-27T10:00:00.000Z', patch: 'test', number: Number(id), slots: [{ playerId: 'p1', player: 'Anna', riotId: 'Anna#EUW', role: 'MID', champion: { id: 103, name: 'Ahri', slug: 'Ahri', role: 'MID', pickRate: 1, games: 1 } }, { playerId: secondPlayer.id, player: secondPlayer.name, riotId: `${secondPlayer.name}#EUW`, role: secondRole, champion: { id: 254, name: second.championName, slug: second.championName, role: secondRole, pickRate: 1, games: 1 } }], sync: { status: 'synced', lastAttemptAt: null, message: null }, match: { matchId: id, fetchedAt: '2026-10-27T11:00:00.000Z', gameStartedAt: '2026-10-27T10:00:00.000Z', gameEndedAt: '2026-10-27T10:30:00.000Z', durationSeconds: 1800, gameMode: 'Ranked', queueId: 420, mapId: 11, gameVersion: 'test', participants: [first, second] } }
}

describe('týmové statistiky', () => {
  it('spočítá pozice, preference hráčů a společné dvojice', () => {
    const insights = buildGroupInsights([game('1', true), game('2', false), game('3', true, 'TOP')])
    expect(insights.pairs[0]).toMatchObject({ playerIds: ['p1', 'p2'], games: 3, wins: 2, losses: 1 })
    expect(insights.players.find((player) => player.playerId === 'p1')).toMatchObject({ primaryRole: 'MID', primaryRoleGames: 3, favoriteChampion: 'Ahri', favoriteChampionGames: 3 })
    expect(insights.players.find((player) => player.playerId === 'p2')).toMatchObject({ primaryRole: 'JUNGLE', favoriteChampion: 'Vi' })
    expect(insights.roles.find((role) => role.role === 'MID')).toMatchObject({ games: 3, topPlayerName: 'Anna', topPlayerGames: 3 })
  })

  it('řadí dvojice nejdřív podle winratu a až potom podle počtu her', () => {
    const insights = buildGroupInsights([
      game('10', true),
      game('11', false),
      game('12', true, 'SUPPORT', { id: 'p3', name: 'Cara' }),
    ])

    expect(insights.pairs.map((pair) => pair.playerNames)).toEqual([
      ['Anna', 'Cara'],
      ['Anna', 'Bob'],
    ])
  })
})
