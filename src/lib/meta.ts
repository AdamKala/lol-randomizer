import { ROLES, type ChampionRoleEntry, type Draft, type MetaDataset, type Role } from '../types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value)

export function validateMetaDataset(value: unknown): MetaDataset {
  if (!isRecord(value)) throw new Error('Soubor musí obsahovat JSON objekt.')
  if (value.schemaVersion !== 1) throw new Error('Nepodporovaná verze datasetu. Očekávána je verze 1.')
  if (typeof value.patch !== 'string' || !value.patch.trim()) throw new Error('Chybí označení patche.')
  if (typeof value.ddragonVersion !== 'string' || !value.ddragonVersion.trim()) {
    throw new Error('Chybí verze Riot Data Dragon.')
  }
  if (typeof value.updatedAt !== 'string' || Number.isNaN(Date.parse(value.updatedAt))) {
    throw new Error('Datum aktualizace datasetu není platné.')
  }
  if (typeof value.staleAfterDays !== 'number' || value.staleAfterDays < 1) {
    throw new Error('staleAfterDays musí být kladné číslo.')
  }
  if (!isRecord(value.source) || typeof value.source.name !== 'string' || typeof value.source.url !== 'string') {
    throw new Error('Chybí informace o zdroji dat.')
  }
  if (!isRecord(value.defaults) || typeof value.defaults.minPickRate !== 'number' || typeof value.defaults.minGames !== 'number') {
    throw new Error('Chybí výchozí filtry datasetu.')
  }
  if (!Array.isArray(value.entries)) throw new Error('Dataset neobsahuje seznam champion-role kombinací.')

  const seen = new Set<string>()
  const roles = new Set<Role>()
  const entries: ChampionRoleEntry[] = value.entries.map((raw, index) => {
    if (!isRecord(raw)) throw new Error(`Položka ${index + 1} není objekt.`)
    const { id, slug, name, role, pickRate, games, winRate, counter } = raw
    if (!Number.isInteger(id) || (id as number) <= 0) throw new Error(`Položka ${index + 1} nemá platné Riot champion ID.`)
    if (typeof slug !== 'string' || !slug.trim()) throw new Error(`Položka ${index + 1} nemá Data Dragon slug.`)
    if (typeof name !== 'string' || !name.trim()) throw new Error(`Položka ${index + 1} nemá název šampiona.`)
    if (!isRole(role)) throw new Error(`Položka ${index + 1} má neplatnou roli.`)
    if (typeof pickRate !== 'number' || pickRate < 0 || pickRate > 100) throw new Error(`Položka ${index + 1} má neplatný pick rate.`)
    if (!Number.isInteger(games) || (games as number) < 0) throw new Error(`Položka ${index + 1} má neplatný počet her.`)
    if (winRate !== undefined && (typeof winRate !== 'number' || winRate < 0 || winRate > 100)) {
      throw new Error(`Položka ${index + 1} má neplatný win rate.`)
    }
    const counterWinRate = isRecord(counter) ? counter.winRateAgainst ?? counter.winRate : undefined
    if (counter !== undefined && (
      !isRecord(counter)
      || typeof counter.slug !== 'string'
      || !counter.slug.trim()
      || typeof counter.name !== 'string'
      || !counter.name.trim()
      || typeof counterWinRate !== 'number'
      || counterWinRate < 0
      || counterWinRate > 100
      || !Number.isInteger(counter.games)
      || (counter.games as number) < 0
    )) throw new Error(`Položka ${index + 1} má neplatná data counteru.`)
    const key = `${role}:${id}`
    if (seen.has(key)) throw new Error(`Duplicitní kombinace role a šampiona: ${role} / ${name}.`)
    seen.add(key)
    roles.add(role)
    return {
      id: id as number,
      slug,
      name,
      role,
      pickRate,
      games: games as number,
      ...(typeof winRate === 'number' ? { winRate } : {}),
      ...(isRecord(counter) ? {
        counter: {
          slug: counter.slug as string,
          name: counter.name as string,
          winRateAgainst: counterWinRate as number,
          games: counter.games as number,
        },
      } : {}),
    }
  })

  const missing = ROLES.filter((role) => !roles.has(role))
  if (missing.length) throw new Error(`Dataset neobsahuje role: ${missing.join(', ')}.`)

  return {
    schemaVersion: 1,
    patch: value.patch,
    ddragonVersion: value.ddragonVersion,
    updatedAt: value.updatedAt,
    staleAfterDays: value.staleAfterDays,
    source: {
      name: value.source.name,
      url: value.source.url,
      scope: typeof value.source.scope === 'string' ? value.source.scope : 'Neuvedeno',
      methodology: typeof value.source.methodology === 'string' ? value.source.methodology : 'Neuvedeno',
    },
    defaults: {
      minPickRate: value.defaults.minPickRate,
      minGames: value.defaults.minGames,
    },
    entries,
  }
}

export function isDatasetStale(dataset: MetaDataset, now = new Date()): boolean {
  const updated = new Date(`${dataset.updatedAt}T00:00:00Z`).getTime()
  return now.getTime() - updated > dataset.staleAfterDays * 86_400_000
}

export async function loadBundledDataset(): Promise<MetaDataset> {
  const url = `${import.meta.env.BASE_URL}data/champion-roles.v1.json`
  const response = await fetch(url)
  if (!response.ok) throw new Error('Výchozí role data se nepodařilo načíst.')
  return validateMetaDataset(await response.json())
}

export function refreshDraftMetadata(draft: Draft, dataset: MetaDataset): Draft {
  const entries = new Map(dataset.entries.map((entry) => [`${entry.role}:${entry.id}`, entry]))
  let changed = draft.patch !== dataset.patch
  const slots = draft.slots.map((slot) => {
    const current = entries.get(`${slot.role}:${slot.champion.id}`)
    if (!current || current === slot.champion) return slot
    changed = true
    return { ...slot, champion: current }
  })
  return changed ? { ...draft, patch: dataset.patch, slots } : draft
}
