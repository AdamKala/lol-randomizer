import { describe, expect, it } from 'vitest'
import type { MatchParticipantStats, MatchSummary, MetaDataset } from '../types'
import { mergeRecentMatches, roleFromTeamPosition } from './recentMatches'
import { DEFAULT_STATE, sanitizeState } from './storage'

const dataset: MetaDataset = {
  schemaVersion: 1,
  patch: '26.21',
  ddragonVersion: '16.21.1',
  updatedAt: '2026-10-27',
  staleAfterDays: 30,
  source: { name: 'test', url: 'https://example.com', scope: 'test', methodology: 'test' },
  defaults: { minPickRate: 0, minGames: 0 },
  entries: [{ id: 103, slug: 'Ahri', name: 'Ahri', role: 'MID', pickRate: 5, games: 1000 }],
}

function participant(overrides: Partial<MatchParticipantStats> = {}): MatchParticipantStats {
  return { playerId: 'p1', displayName: 'Anna', riotId: 'Anna#EUW', puuid: 'puuid', championId: 103, championName: 'Ahri', teamId: 100, teamPosition: 'MIDDLE', kills: 10, deaths: 2, assists: 8, goldEarned: 12000, visionScore: 20, totalDamageDealtToChampions: 24000, totalMinionsKilled: 180, neutralMinionsKilled: 10, win: true, ...overrides }
}

function match(matchId: string, gameStartedAt: string, participants = [participant()]): MatchSummary {
  return { matchId, fetchedAt: '2026-10-27T12:00:00.000Z', gameStartedAt, gameEndedAt: '2026-10-27T11:30:00.000Z', durationSeconds: 1800, gameMode: 'CLASSIC', queueId: 420, mapId: 11, gameVersion: '16.21.1', participants }
}

describe('import posledních Riot zápasů', () => {
  it('převede pozice na role randomizeru', () => {
    expect(roleFromTeamPosition('MIDDLE')).toBe('MID')
    expect(roleFromTeamPosition('BOTTOM')).toBe('ADC')
    expect(roleFromTeamPosition('UTILITY')).toBe('SUPPORT')
  })

  it('odstraní duplicity, seřadí historii a vytvoří sloty pro všechny hráče', () => {
    const earlier = match('EUN1_1', '2026-10-26T10:00:00.000Z')
    const later = match('EUN1_2', '2026-10-27T10:00:00.000Z', [
      participant(),
      participant({ playerId: 'p2', displayName: 'Boris', riotId: 'Boris#EUW', puuid: 'puuid-2', teamPosition: 'TOP' }),
    ])
    const result = mergeRecentMatches([], [later, earlier, later], dataset)
    expect(result.added).toBe(2)
    expect(result.history.map((game) => game.match?.matchId)).toEqual(['EUN1_1', 'EUN1_2'])
    expect(result.history.map((game) => game.number)).toEqual([1, 2])
    expect(result.history[1].origin).toBe('riot-import')
    expect(result.history[1].slots).toHaveLength(2)
  })

  it('zachová importovaný zápas s více než pěti hráči po načtení úložiště', () => {
    const participants = Array.from({ length: 6 }, (_, index) => participant({ playerId: `p${index}`, displayName: `Hráč ${index}`, riotId: `Hrac${index}#EUW`, puuid: `puuid-${index}` }))
    const imported = mergeRecentMatches([], [match('EUN1_6', '2026-10-27T10:00:00.000Z', participants)], dataset).history
    const restored = sanitizeState({ ...DEFAULT_STATE, history: imported })
    expect(restored.history).toHaveLength(1)
    expect(restored.history[0].slots).toHaveLength(6)
    expect(restored.history[0].origin).toBe('riot-import')
  })
})
