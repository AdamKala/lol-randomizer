import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface BundledDataset {
  source: { name: string; methodology: string }
  entries: Array<{ id: number; name: string; role: string; pickRate: number; winRate?: number; counter?: { name: string; winRateAgainst: number; games: number } }>
}

const bundledDataset = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/champion-roles.v1.json'), 'utf8')) as BundledDataset

describe('výchozí meta dataset', () => {
  it('používá veřejné role U.GG místo Riot tříd', () => {
    expect(bundledDataset.source.name).toMatch(/U\.GG/i)
    expect(bundledDataset.source.methodology).toMatch(/nikoli z Riot tříd/i)
  })

  it('obsahuje reálně hrané netradiční kombinace jako Karthus ADC', () => {
    expect(bundledDataset.entries).toContainEqual(expect.objectContaining({ id: 30, name: 'Karthus', role: 'ADC' }))
  })

  it('obsahuje offline pickrate, winrate a největší counter', () => {
    const karthusAdc = bundledDataset.entries.find((entry) => entry.id === 30 && entry.role === 'ADC')
    expect(karthusAdc).toEqual(expect.objectContaining({
      pickRate: expect.any(Number),
      winRate: expect.any(Number),
      counter: expect.objectContaining({ name: expect.any(String), winRateAgainst: expect.any(Number), games: expect.any(Number) }),
    }))
  })

  it('počítá counter jako nejhorší matchup, ne jako nejsnazšího soupeře', () => {
    const nautilus = bundledDataset.entries.find((entry) => entry.name === 'Nautilus' && entry.role === 'SUPPORT')
    expect(nautilus?.counter?.name).toBe('Rell')
    expect(nautilus?.counter?.winRateAgainst).toBeLessThan(nautilus?.winRate ?? 0)
  })
})
