import { describe, expect, it } from 'vitest'
import type { ChampionRoleEntry, ConfirmedGame, Draft, MetaDataset, Role, Settings } from '../types'
import { ROLES } from '../types'
import {
  confirmDraft,
  generateDraft,
  getBlockedChampionIds,
  getCooldownEntries,
  rerollOneChampion,
  validatePlayers,
} from './randomizer'
import { loadState, saveState, STORAGE_KEY } from './storage'

const settings: Settings = { cooldownGames: 3, minPickRate: 0.5, minGames: 100 }
const players = ['Anna', 'Borek', 'Cyril', 'Dana', 'Erik']

function entry(id: number, role: Role, offset = 0): ChampionRoleEntry {
  return { id, role, name: `${role} šampion ${offset}`, slug: `Champion${id}`, pickRate: 2, games: 1000 }
}

const entries = ROLES.flatMap((role, roleIndex) =>
  Array.from({ length: 6 }, (_, index) => entry(roleIndex * 100 + index + 1, role, index + 1)),
)

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
  const slots = ROLES.map((role, index) => ({ player: players[index], role, champion: entry(index === 0 ? championId : number * 1000 + index, role, index) }))
  return { id, slots, patch: 'test', createdAt: '2026-10-27T10:00:00.000Z', confirmedAt: `2026-10-27T1${number}:00:00.000Z`, number }
}

describe('losování sestavy', () => {
  it('přiřadí pěti hráčům pět unikátních rolí', () => {
    const draft = generateDraft(players, dataset, settings, [], deterministic)
    expect(new Set(draft.slots.map((slot) => slot.role))).toEqual(new Set(ROLES))
  })

  it('každý vybraný šampion patří v datasetu ke své roli', () => {
    const draft = generateDraft(players, dataset, settings, [], deterministic)
    for (const slot of draft.slots) {
      expect(dataset.entries.some((candidate) => candidate.id === slot.champion.id && candidate.role === slot.role)).toBe(true)
    }
  })

  it('v jedné sestavě neopakuje šampiona', () => {
    const draft = generateDraft(players, dataset, settings, [], deterministic)
    expect(new Set(draft.slots.map((slot) => slot.champion.id))).toHaveLength(5)
  })

  it('generování návrhu nemění historii', () => {
    const history = [game('old', 900, 1)]
    const before = structuredClone(history)
    generateDraft(players, dataset, settings, history, deterministic)
    expect(history).toEqual(before)
  })

  it('reroll jednoho šampiona nemění historii ani původní draft', () => {
    const history = [game('old', 900, 1)]
    const draft = generateDraft(players, dataset, settings, history, deterministic)
    const beforeHistory = structuredClone(history)
    const beforeDraft = structuredClone(draft)
    const rerolled = rerollOneChampion(draft, 0, dataset, settings, history, () => 0)
    expect(history).toEqual(beforeHistory)
    expect(draft).toEqual(beforeDraft)
    expect(rerolled.slots[0].champion.id).not.toBe(draft.slots[0].champion.id)
  })

  it('bezpečně odmítne nedostatečný pool', () => {
    const tiny = { ...dataset, entries: dataset.entries.filter((candidate) => candidate.role !== 'ADC') }
    expect(() => generateDraft(players, tiny, settings, [], deterministic)).toThrow(/dost dostupných/i)
  })
})

describe('potvrzení a cooldown', () => {
  it('potvrzení zapíše právě jeden záznam i při opakovaném volání', () => {
    const draft = generateDraft(players, dataset, settings, [], deterministic)
    const once = confirmDraft(draft, [], '2026-10-27T12:00:00.000Z')
    const twice = confirmDraft(draft, once, '2026-10-27T12:00:01.000Z')
    expect(once).toHaveLength(1)
    expect(twice).toHaveLength(1)
  })

  it('šampiona blokuje po další tři potvrzené hry', () => {
    const history = [game('g1', 42, 1)]
    expect(getBlockedChampionIds(history, 3).has(42)).toBe(true)
    history.push(game('g2', 43, 2))
    expect(getBlockedChampionIds(history, 3).has(42)).toBe(true)
    history.push(game('g3', 44, 3))
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
  it('odmítne neúplná i duplicitní jména bez ohledu na velikost písmen', () => {
    expect(validatePlayers(['A', 'B', '', 'D', 'E'])).toMatch(/pět jmen/i)
    expect(validatePlayers(['Anna', 'B', ' anna ', 'D', 'E'])).toMatch(/unikátní/i)
  })

  it('zachová stav po simulovaném obnovení stránky', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    }
    const draft: Draft = generateDraft(players, dataset, settings, [], deterministic)
    const state = { schemaVersion: 2 as const, players, draft, history: confirmDraft(draft, []), settings, customDataset: dataset }
    saveState(state, storage)
    expect(values.has(STORAGE_KEY)).toBe(true)
    expect(loadState(storage)).toEqual(state)
  })

  it('poškozený uložený stav neshodí aplikaci', () => {
    const storage = { getItem: () => '{neni-json' }
    expect(loadState(storage).players).toHaveLength(5)
  })
})
