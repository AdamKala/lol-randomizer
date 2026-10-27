import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Draft, MetaDataset } from '../types'
import { loadBundledDataset, refreshDraftMetadata } from './meta'

afterEach(() => vi.unstubAllGlobals())

const dataset: MetaDataset = {
  schemaVersion: 1,
  patch: '26.21',
  ddragonVersion: '16.21.1',
  updatedAt: '2026-10-27',
  staleAfterDays: 21,
  source: { name: 'Test', url: 'https://example.test', scope: 'Test', methodology: 'Test' },
  defaults: { minPickRate: 0.5, minGames: 100 },
  entries: [{
    id: 92,
    slug: 'Riven',
    name: 'Riven',
    role: 'TOP',
    pickRate: 2.25,
    games: 39_800,
    winRate: 49.83,
    counter: { slug: 'poppy', name: 'Poppy', winRateAgainst: 42.44, games: 172 },
  }],
}

describe('obnovení meta dat rozpracovaného draftu', () => {
  it('načte výchozí dataset přímo z balíčku bez síťového fetch', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    const bundled = await loadBundledDataset()

    expect(bundled.schemaVersion).toBe(1)
    expect(bundled.entries.length).toBeGreaterThan(100)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('nahradí zastaralý counter aktuální položkou z datasetu', () => {
    const draft: Draft = {
      id: 'draft-1',
      createdAt: '2026-10-27T10:00:00.000Z',
      patch: 'old',
      slots: [{
        playerId: 'p1',
        player: 'Vojta',
        riotId: 'Vojta#EUW',
        role: 'TOP',
        champion: {
          id: 92,
          slug: 'Riven',
          name: 'Riven',
          role: 'TOP',
          pickRate: 2.25,
          games: 39_800,
          winRate: 49.83,
          counter: { slug: 'ksante', name: "K'Sante", winRateAgainst: 57.81, games: 128 },
        },
      }],
    }

    const refreshed = refreshDraftMetadata(draft, dataset)

    expect(refreshed.patch).toBe('26.21')
    expect(refreshed.slots[0].champion.counter).toEqual({ slug: 'poppy', name: 'Poppy', winRateAgainst: 42.44, games: 172 })
    expect(draft.slots[0].champion.counter?.name).toBe("K'Sante")
  })
})
