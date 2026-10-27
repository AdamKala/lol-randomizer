import { describe, expect, it } from 'vitest'
import { parseOpggRecentMatches } from './matches'

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
          {"@type":"PropertyValue","name":"cs","value":205}
        ]
      }
    }]
  }]
}</script></head></html>`

describe('OP.GG veřejná historie', () => {
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
    }])
  })

  it('odmítne stránku bez historie', () => {
    expect(() => parseOpggRecentMatches('<html></html>')).toThrow(/neobsahuje čitelnou historii/i)
  })
})
