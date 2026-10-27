import { ROLES, type ChampionRoleEntry, type ConfirmedGame, type CooldownEntry, type Draft, type DraftSlot, type MetaDataset, type Role, type Settings } from '../types'

export type RandomSource = () => number

export function validatePlayers(players: string[]): string | null {
  if (players.length !== 5 || players.some((name) => !name.trim())) return 'Vyplň přesně pět jmen hráčů.'
  const normalized = players.map((name) => name.trim().toLocaleLowerCase('cs'))
  if (new Set(normalized).size !== 5) return 'Každý hráč musí mít unikátní jméno.'
  return null
}

export function shuffle<T>(values: readonly T[], random: RandomSource = Math.random): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

export function getBlockedChampionIds(history: ConfirmedGame[], cooldownGames: number): Set<number> {
  if (cooldownGames <= 0) return new Set()
  return new Set(history.slice(-cooldownGames).flatMap((game) => game.slots.map((slot) => slot.champion.id)))
}

export function getCooldownEntries(history: ConfirmedGame[], cooldownGames: number): CooldownEntry[] {
  if (cooldownGames <= 0) return []
  const result = new Map<number, CooldownEntry>()
  history.slice(-cooldownGames).forEach((game, offset, recentGames) => {
    const gamesAfter = recentGames.length - 1 - offset
    for (const slot of game.slots) {
      const existing = result.get(slot.champion.id)
      const remainingGames = cooldownGames - gamesAfter
      if (!existing || remainingGames > existing.remainingGames) {
        result.set(slot.champion.id, { champion: slot.champion, remainingGames })
      }
    }
  })
  return [...result.values()].sort((a, b) => b.remainingGames - a.remainingGames || a.champion.name.localeCompare(b.champion.name, 'cs'))
}

export function eligibleForRole(dataset: MetaDataset, role: Role, settings: Settings): ChampionRoleEntry[] {
  return dataset.entries.filter(
    (entry) => entry.role === role && entry.pickRate >= settings.minPickRate && entry.games >= settings.minGames,
  )
}

function assignChampions(
  playerRoles: Array<{ player: string; role: Role }>,
  dataset: MetaDataset,
  settings: Settings,
  blocked: Set<number>,
  random: RandomSource,
): DraftSlot[] | null {
  const candidates = playerRoles.map((assignment, originalIndex) => ({
    ...assignment,
    originalIndex,
    candidates: shuffle(
      eligibleForRole(dataset, assignment.role, settings).filter((champion) => !blocked.has(champion.id)),
      random,
    ),
  }))
  candidates.sort((a, b) => a.candidates.length - b.candidates.length)
  const chosen = new Map<number, DraftSlot>()
  const used = new Set<number>()

  const visit = (index: number): boolean => {
    if (index === candidates.length) return true
    const assignment = candidates[index]
    for (const champion of assignment.candidates) {
      if (used.has(champion.id)) continue
      used.add(champion.id)
      chosen.set(assignment.originalIndex, { player: assignment.player, role: assignment.role, champion })
      if (visit(index + 1)) return true
      used.delete(champion.id)
      chosen.delete(assignment.originalIndex)
    }
    return false
  }

  return visit(0) ? playerRoles.map((_, index) => chosen.get(index)!) : null
}

function createDraftId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function generateDraft(
  players: string[],
  dataset: MetaDataset,
  settings: Settings,
  history: ConfirmedGame[],
  random: RandomSource = Math.random,
  fixedRoles?: Role[],
): Draft {
  const error = validatePlayers(players)
  if (error) throw new Error(error)
  if (fixedRoles && (fixedRoles.length !== 5 || new Set(fixedRoles).size !== 5)) {
    throw new Error('Pevné rozdělení musí obsahovat pět unikátních rolí.')
  }
  const roles = fixedRoles ?? shuffle(ROLES, random)
  const assignments = players.map((player, index) => ({ player: player.trim(), role: roles[index] }))
  const slots = assignChampions(assignments, dataset, settings, getBlockedChampionIds(history, settings.cooldownGames), random)
  if (!slots) {
    throw new Error('Pro zvolené filtry a cooldown není dost dostupných šampionů. Sniž filtr, zkrať cooldown nebo importuj větší dataset.')
  }
  return { id: createDraftId(), createdAt: new Date().toISOString(), patch: dataset.patch, slots }
}

export function rerollOneChampion(
  draft: Draft,
  slotIndex: number,
  dataset: MetaDataset,
  settings: Settings,
  history: ConfirmedGame[],
  random: RandomSource = Math.random,
): Draft {
  const slot = draft.slots[slotIndex]
  if (!slot) throw new Error('Hráč v návrhu neexistuje.')
  const blocked = getBlockedChampionIds(history, settings.cooldownGames)
  const used = new Set(draft.slots.filter((_, index) => index !== slotIndex).map((item) => item.champion.id))
  const candidates = eligibleForRole(dataset, slot.role, settings).filter(
    (champion) => champion.id !== slot.champion.id && !blocked.has(champion.id) && !used.has(champion.id),
  )
  if (!candidates.length) throw new Error(`Pro roli ${slot.role} už není jiný dostupný šampion.`)
  const champion = candidates[Math.floor(random() * candidates.length)]
  const slots = draft.slots.map((item, index) => (index === slotIndex ? { ...item, champion } : item))
  return { ...draft, id: createDraftId(), createdAt: new Date().toISOString(), slots }
}

export function confirmDraft(draft: Draft, history: ConfirmedGame[], confirmedAt = new Date().toISOString()): ConfirmedGame[] {
  if (history.some((game) => game.id === draft.id)) return history
  const number = history.reduce((max, game) => Math.max(max, game.number), 0) + 1
  return [...history, { ...draft, number, confirmedAt }]
}
