import { describe, expect, it } from 'vitest'
import type { ConfirmedGame, MatchParticipantStats, MatchSummary } from '../types'
import { cachedMatchCoverage, createStatisticsFile, matchesFromHistory, mergeMatchSummaries, parseStatisticsFile } from './statistics-file'

function participant(playerId: string, detailedStats: boolean, damage = 0): MatchParticipantStats {
  return { playerId, displayName: playerId, riotId: `${playerId}#EUNE`, puuid: `puuid-${playerId}`, championId: 103, championName: 'Ahri', teamId: 100, teamPosition: 'MIDDLE', kills: 5, deaths: 2, assists: 7, goldEarned: detailedStats ? 12000 : 0, visionScore: detailedStats ? 20 : 0, totalDamageDealtToChampions: damage, totalMinionsKilled: 180, neutralMinionsKilled: 5, win: true, detailedStats, performanceScore: 7.5, performanceRank: 2 }
}

function match(participants: MatchParticipantStats[], fetchedAt = '2026-10-27T10:00:00.000Z'): MatchSummary {
  return { matchId: 'OPGG_eune_1', fetchedAt, gameStartedAt: '2026-10-27T09:00:00.000Z', gameEndedAt: '2026-10-27T09:30:00.000Z', durationSeconds: 1800, gameMode: 'Ranked Solo/Duo', queueId: 420, mapId: 11, gameVersion: '26.21', source: 'opgg', participants }
}

function game(summary: MatchSummary): ConfirmedGame {
  return { id: 'import-1', createdAt: summary.gameStartedAt, confirmedAt: summary.gameStartedAt, patch: '26.21', number: 1, origin: 'opgg-import', slots: [], match: summary, sync: { status: 'synced', lastAttemptAt: summary.fetchedAt, message: null } }
}

describe('Git cache statistik', () => {
  it('sloučí stejný zápas a zachová nejúplnější data každého hráče', () => {
    const merged = mergeMatchSummaries([
      match([participant('p1', false)]),
      match([participant('p1', true, 32000), participant('p2', true, 21000)], '2026-10-27T11:00:00.000Z'),
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0].participants).toHaveLength(2)
    expect(merged[0].participants.find((item) => item.playerId === 'p1')).toMatchObject({ detailedStats: true, totalDamageDealtToChampions: 32000 })
  })

  it('ukládá každý matchId jen jednou a vytváří cache kompletních hráčů', () => {
    const summary = match([participant('p1', true, 32000), participant('p2', false)])
    const history = [game(summary), game(summary)]
    const file = createStatisticsFile(matchesFromHistory(history), '2026-10-27T12:00:00.000Z')

    expect(parseStatisticsFile(file).matches).toHaveLength(1)
    expect(cachedMatchCoverage(history)).toEqual([{ matchId: summary.matchId, detailedPlayerIds: ['p1'] }])
  })

  it('odmítne poškozený soubor místo tichého přepsání cache', () => {
    expect(() => parseStatisticsFile({ schemaVersion: 1, updatedAt: 'neplatné', matches: [] })).toThrow(/podporovaný formát/i)
  })
})
