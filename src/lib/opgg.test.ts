import { describe, expect, it } from 'vitest'
import type { MatchSummary } from '../types'
import { createOpggGamesActionHeaders, matchNeedsRefresh, parseOpggGamesActionResponse, parseOpggMatchDetail, parseOpggRecentMatches, selectOpggRecentMatches } from './opgg'

const html = `<!doctype html><html><head><script type="application/ld+json">{
  "@context":"https://schema.org",
  "@graph":[{
    "@type":"ItemList",
    "@id":"https://op.gg/lol/summoners/eune/Test-EUNE#recent-games",
    "name":"Test#EUNE recent matches",
    "itemListElement":[{
      "@type":"ListItem",
      "position":1,
      "item":{
        "@type":"PlayGameAction",
        "startTime":"2026-10-27T10:00:00+01:00",
        "additionalProperty":[
          {"@type":"PropertyValue","name":"matchId","value":"public-match-1"},
          {"@type":"PropertyValue","name":"queueType","value":"SOLORANKED"},
          {"@type":"PropertyValue","name":"champion","value":"Ahri"},
          {"@type":"PropertyValue","name":"result","value":"WIN"},
          {"@type":"PropertyValue","name":"kills","value":8},
          {"@type":"PropertyValue","name":"deaths","value":2},
          {"@type":"PropertyValue","name":"assists","value":11},
          {"@type":"PropertyValue","name":"cs","value":205},
          {"@type":"PropertyValue","name":"opScore","value":8.4},
          {"@type":"PropertyValue","name":"opScoreRank","value":2}
        ]
      }
    }]
  }]
}</script></head></html>`

describe('OP.GG veřejná historie', () => {
  it('použije pro serverovou akci OP.GG původ profilu místo Tauri webview', () => {
    const profileUrl = 'https://op.gg/lol/summoners/eune/Test-EUNE'

    expect(createOpggGamesActionHeaders('action-id', profileUrl)).toMatchObject({
      'Next-Action': 'action-id',
      Origin: 'https://op.gg',
      Referer: profileUrl,
    })
  })

  it('načte strukturovaný JSON-LD bez API klíče', () => {
    expect(parseOpggRecentMatches(html)).toEqual([{
      rawMatchId: 'public-match-1',
      gameStartedAt: '2026-10-27T10:00:00+01:00',
      queueType: 'SOLORANKED',
      championName: 'Ahri',
      kills: 8,
      deaths: 2,
      assists: 11,
      cs: 205,
      win: true,
      opScore: 8.4,
      opScoreRank: 2,
    }])
  })

  it('odmítne stránku bez historie', () => {
    expect(() => parseOpggRecentMatches('<html></html>')).toThrow(/neobsahuje čitelnou historii/i)
  })

  it('vybere historii podle počtu nebo data', () => {
    const matches = parseOpggRecentMatches(html)
    const older = { ...matches[0], rawMatchId: 'older', gameStartedAt: '2026-10-20T10:00:00.000Z' }
    const newer = { ...matches[0], rawMatchId: 'newer', gameStartedAt: '2026-10-27T10:00:00.000Z' }
    expect(selectOpggRecentMatches([newer, older], { mode: 'count', count: 1 }).map((match) => match.rawMatchId)).toEqual(['newer'])
    expect(selectOpggRecentMatches([newer, older], { mode: 'since', since: '2026-10-25T00:00:00.000Z' }).map((match) => match.rawMatchId)).toEqual(['newer'])
    const many = Array.from({ length: 125 }, (_, index) => ({ ...newer, rawMatchId: `match-${index}` }))
    expect(selectOpggRecentMatches(many, { mode: 'count', count: 125 })).toHaveLength(125)
  })

  it('načte stránku starších her včetně damage a kurzoru', () => {
    const game = {
      id: 'older-match',
      puuid: 'puuid-1',
      created_at: '2026-10-20T10:00:00.000Z',
      game_version: '16.21',
      game_length: 1800,
      game_result: 'WIN',
      game_type: { game_type: 'SOLORANKED' },
      champion: { name: 'Ahri' },
      stats: { op_score: 8.4, op_score_rank: 2, kda: { kill: 8, death: 2, assist: 11 }, cs: { totalCs: 208 } },
      team_blue: [{ participant_id: 1, champion_id: 103, team_key: 'BLUE', position: 'MID', champion: { name: 'Ahri' }, summoner: { puuid: 'puuid-1' }, stats: { kill: 8, death: 2, assist: 11, gold_earned: 12345, vision_score: 24, total_damage_dealt_to_champions: 28765, minion_kill: 205, neutral_minion_kill: 3, result: 'WIN', op_score: 8.4, op_score_rank: 2 } }],
      team_red: [],
    }
    const response = `0:{"a":"$@1"}\n1:${JSON.stringify({ data: [game], meta: { last_game_created_at: '2026-10-19T10:00:00.000Z' } })}`
    const page = parseOpggGamesActionResponse(response, 'puuid-1')
    expect(page.nextCursor).toBe('2026-10-19T10:00:00.000Z')
    expect(page.matches[0]).toMatchObject({ rawMatchId: 'older-match', durationSeconds: 1800, gameVersion: '16.21', detailedParticipant: { championName: 'Ahri', totalDamageDealtToChampions: 28765, detailedStats: true } })
  })

  it('načte damage, vision a hodnocení z detailu zápasu', () => {
    const detailJsonLd = JSON.stringify({
      '@type': 'PlayGameAction',
      startTime: '2026-10-27T10:00:00.000Z',
      additionalProperty: [
        { name: 'matchId', value: 'public-match-1' },
        { name: 'queueType', value: 'SOLORANKED' },
        { name: 'patch', value: '16.21' },
        { name: 'durationSeconds', value: 1800 },
      ],
    })
    const participant = {
      participant_id: 3,
      champion_id: 103,
      team_key: 'BLUE',
      position: 'MID',
      champion: { name: 'Ahri' },
      summoner: { game_name: 'Test', tagline: 'EUNE', puuid: 'puuid-1' },
      stats: { kill: 8, death: 2, assist: 11, gold_earned: 12345, vision_score: 24, total_damage_dealt_to_champions: 28765, minion_kill: 205, neutral_minion_kill: 3, result: 'WIN', op_score: 8.4, op_score_rank: 2 },
    }
    const flightLine = `65:${JSON.stringify({ data: [participant] })}\n`
    const detailHtml = `<script type="application/ld+json">${detailJsonLd}</script><script>self.__next_f.push(${JSON.stringify([1, flightLine])})</script>`
    const result = parseOpggMatchDetail(detailHtml, 'eune', 'public-match-1', [{ playerId: 'p1', displayName: 'Tester', riotId: 'Test #EUNE' }])
    expect(result).toMatchObject({ durationSeconds: 1800, gameMode: 'Ranked Solo/Duo', gameVersion: '16.21', source: 'opgg' })
    expect(result.participants[0]).toMatchObject({ championName: 'Ahri', kills: 8, deaths: 2, assists: 11, totalDamageDealtToChampions: 28765, visionScore: 24, detailedStats: true, performanceScore: 8.4, performanceRank: 2 })
  })

  it('neobnovuje zápas, pokud cache obsahuje detail všech nalezených hráčů', () => {
    const summary = { matchId: 'OPGG_eune_public-match-1', participants: [{ playerId: 'p1' }] } as MatchSummary

    expect(matchNeedsRefresh(summary, { matchId: summary.matchId, detailedPlayerIds: ['p1'] })).toBe(false)
    expect(matchNeedsRefresh(summary, { matchId: summary.matchId, detailedPlayerIds: [] })).toBe(true)
  })
})
