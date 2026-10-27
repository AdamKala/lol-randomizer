import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface BundledDataset {
  source: { name: string; methodology: string }
  entries: Array<{ id: number; name: string; role: string }>
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
})
