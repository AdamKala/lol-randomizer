import { describe, expect, it } from 'vitest'
import type { ChampionRoleEntry, ConfirmedGame, Draft, MetaDataset, Player, Role, Settings } from '../types'
import { ROLES } from '../types'
import { confirmDraft, generateDraft, getBlockedChampionIds, getCooldownEntries, rerollOneChampion, validatePlayers } from './randomizer'
import { loadState, saveState, STORAGE_KEY } from './storage'

const settings: Settings = { cooldownGames: 3, minPickRate: 0.5, minGames: 100 }
const players: Player[] = ['Anna', 'Borek', 'Cyril', 'Dana', 'Erik', 'Filip'].map((name, index) => ({ id: `p${index + 1}`, name, riotId: `${name}#EUW` }))

function entry(id: number, role: Role, offset = 0): ChampionRoleEntry {
  return { id, role, name: `${role} šampion ${offset}`, slug: `Champion${id}`, pickRate: 2, games: 1000 }
}

const entries = ROLES.flatMap((role, roleIndex) => Array.from({ length: 6 }, (_, index) => entry(roleIndex * 100 + index + 1, role, index + 1)))

const dataset: MetaDataset = {
  schemaVersion: 1,
  patch: 'test',
  ddragonVersion: 'test',
  updatedAt: '2026-10-27',
  staleAfterDays: 21,
  source: { name: 'Test', url: 'https://example.test', scope: 'Test', methodology: 'Test' },
  defaults: { minPickRate: 0.5, minGames: 100 },
  entries,
}

const deterministic = () => 0.42

function game(id: string, championId: number, number: number): ConfirmedGame {
  const slots = ROLES.map((role, index) => ({ playerId: players[index].id, player: players[index].name, riotId: players[index].riotId, role, champion: entry(index === 0 ? championId : number * 1000 + index, role, index) }))
  return { id, slots, patch: 'test', createdAt: '2026-10-27T10:00:00.000Z', confirmedAt: `2026-10-27T1${number}:00:00.000Z`, number, match: null, sync: { status: 'pending', lastAttemptAt: null, message: null } }
}

describe('losování sestavy', () => {
  it('přiřadí pěti zaškrtnutým hráčům pět unikátních rolí', () => {
    const draft = generateDraft(players.slice(0, 5), dataset, settings, [], deterministic)
    expect(new Set(draft.slots.map((slot) => slot.role))).toEqual(new Set(ROLES))
  })

  it('funguje i pro méně než pět hráčů', () => {
    const draft = generateDraft(players.slice(0, 3), dataset, settings, [], deterministic)
    expect(draft.slots).toHaveLength(3)
    expect(new Set(draft.slots.map((slot) => slot.role))).toHaveLength(3)
  })

  it('odmítne více než pět zaškrtnutých hráčů', () => {
    expect(() => generateDraft(players, dataset, settings, [], deterministic)).toThrow(/nejvýše pět/i)
  })

  it('každý vybraný šampion patří v datasetu ke své roli', () => {
    const draft = generateDraft(players.slice(0, 5), dataset, settings, [], deterministic)
    for (const slot of draft.slots) expect(dataset.entries.some((candidate) => candidate.id === slot.champion.id && candidate.role === slot.role)).toBe(true)
  })

  it('v jedné sestavě neopakuje šampiona', () => {
    const draft = generateDraft(players.slice(0, 5), dataset, settings, [], deterministic)
    expect(new Set(draft.slots.map((slot) => slot.champion.id))).toHaveLength(5)
  })

  it('generování návrhu nemění historii', () => {
    const history = [game('old', 900, 1)]
    const before = structuredClone(history)
    generateDraft(players.slice(0, 5), dataset, settings, history, deterministic)
    expect(history).toEqual(before)
  })

  it('reroll jednoho šampiona nemění historii ani původní draft', () => {
    const history = [game('old', 900, 1)]
    const draft = generateDraft(players.slice(0, 5), dataset, settings, history, deterministic)
    const beforeHistory = structuredClone(history)
    const beforeDraft = structuredClone(draft)
    const rerolled = rerollOneChampion(draft, 0, dataset, settings, history, () => 0)
    expect(history).toEqual(beforeHistory)
    expect(draft).toEqual(beforeDraft)
    expect(rerolled.slots[0].champion.id).not.toBe(draft.slots[0].champion.id)
  })

  it('bezpečně odmítne nedostatečný pool', () => {
    const tiny = { ...dataset, entries: dataset.entries.filter((candidate) => candidate.role !== 'ADC') }
    expect(() => generateDraft(players.slice(0, 5), tiny, settings, [], deterministic)).toThrow(/dost dostupných/i)
  })
})

describe('potvrzení a cooldown', () => {
  it('potvrzení zapíše právě jeden záznam a nastaví čekání na Riot data', () => {
    const draft = generateDraft(players.slice(0, 5), dataset, settings, [], deterministic)
    const once = confirmDraft(draft, [], '2026-10-27T12:00:00.000Z')
    const twice = confirmDraft(draft, once, '2026-10-27T12:00:01.000Z')
    expect(once).toHaveLength(1)
    expect(once[0].sync.status).toBe('pending')
    expect(twice).toHaveLength(1)
  })

  it('bez Riot ID uloží hru, ale označí ji jako nesledovanou', () => {
    const draft = generateDraft([{ ...players[0], riotId: '' }], dataset, settings, [], deterministic)
    expect(confirmDraft(draft, [])[0].sync.status).toBe('untracked')
  })

  it('šampiona blokuje po další tři potvrzené hry', () => {
    const history = [game('g1', 42, 1)]
    expect(getBlockedChampionIds(history, 3).has(42)).toBe(true)
    history.push(game('g2', 43, 2), game('g3', 44, 3))
    expect(getBlockedChampionIds(history, 3).has(42)).toBe(true)
    expect(getCooldownEntries(history, 3).find((item) => item.champion.id === 42)?.remainingGames).toBe(1)
  })

  it('po třech dalších potvrzených hrách šampiona znovu zpřístupní', () => {
    const history = [game('g1', 42, 1), game('g2', 43, 2), game('g3', 44, 3), game('g4', 45, 4)]
    expect(getBlockedChampionIds(history, 3).has(42)).toBe(false)
  })

  it('vrácení poslední hry přepočítá cooldown z historie', () => {
    const history = [game('g1', 42, 1), game('g2', 43, 2)]
    expect(getBlockedChampionIds(history, 1).has(42)).toBe(false)
    const undone = history.slice(0, -1)
    expect(getBlockedChampionIds(undone, 1).has(42)).toBe(true)
    expect(getBlockedChampionIds(undone, 1).has(43)).toBe(false)
  })
})

describe('validace a ukládání', () => {
  it('odmítne prázdný výběr a duplicitní jména bez ohledu na velikost písmen', () => {
    expect(validatePlayers([])).toMatch(/alespoň jednoho/i)
    expect(validatePlayers([{ ...players[0], name: 'Anna' }, { ...players[1], name: ' anna ' }])).toMatch(/unikátní/i)
  })

  it('zachová roster, výběr a stav po simulovaném obnovení stránky', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    const selected = players.slice(0, 3)
    const draft: Draft = generateDraft(selected, dataset, settings, [], deterministic)
    const state = { schemaVersion: 3 as const, players, selectedPlayerIds: selected.map((player) => player.id), draft, history: confirmDraft(draft, []), settings, customDataset: dataset }
    saveState(state, storage)
    expect(values.has(STORAGE_KEY)).toBe(true)
    expect(loadState(storage)).toEqual(state)
  })

  it('migruje starý seznam pěti textových jmen do rosteru', () => {
    const legacy = { schemaVersion: 2, players: ['Anna', 'Borek', '', 'Dana', 'Erik'], draft: null, history: [], settings, customDataset: null }
    const storage = { getItem: (key: string) => key.endsWith(':v2') ? JSON.stringify(legacy) : null }
    const migrated = loadState(storage)
    expect(migrated.schemaVersion).toBe(3)
    expect(migrated.players.map((player) => player.name)).toEqual(['Anna', 'Borek', 'Dana', 'Erik'])
    expect(migrated.selectedPlayerIds).toHaveLength(4)
  })

  it('poškozený uložený stav neshodí aplikaci', () => {
    const storage = { getItem: () => '{neni-json' }
    expect(loadState(storage).players).toEqual([])
  })
})
