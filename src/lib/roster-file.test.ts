import { describe, expect, it } from 'vitest'
import { createRosterFile, parseRosterFile, validateRosterPlayers } from './roster-file'

const players = [
  { id: 'player-1', name: 'Anna', riotId: 'Anna#EUW' },
  { id: 'player-2', name: 'Borek', riotId: '' },
]

describe('Git roster soubor', () => {
  it('vytvoří a znovu načte verzovaný soubor hráčů', () => {
    const file = createRosterFile(players, '2026-10-27T10:00:00.000Z')
    expect(parseRosterFile(JSON.parse(JSON.stringify(file)))).toEqual(file)
  })

  it('odmítne duplicitní jména a neplatné Riot ID', () => {
    expect(() => validateRosterPlayers([...players, { id: 'player-3', name: ' anna ', riotId: '' }])).toThrow(/duplicitní jméno/i)
    expect(() => validateRosterPlayers([{ ...players[0], riotId: 'bez-tagu' }])).toThrow(/Riot ID/i)
  })

  it('nepovolí v souboru víc než padesát hráčů', () => {
    expect(() => validateRosterPlayers(Array.from({ length: 51 }, (_, index) => ({ id: `p${index}`, name: `Hráč ${index}`, riotId: '' })))).toThrow(/nejvýše 50/i)
  })
})
