import { ROLES, type ChampionRoleEntry, type ConfirmedGame, type CooldownEntry, type Draft, type DraftPlayer, type DraftSlot, type MetaDataset, type Role, type Settings } from '../types'

export type RandomSource = () => number

export function validatePlayers(players: DraftPlayer[]): string | null {
  if (!players.length) return 'Zaškrtni alespoň jednoho hráče.'
  if (players.length > ROLES.length) return 'Do jedné sestavy můžeš vybrat nejvýše pět hráčů.'
  if (players.some((player) => !player.name.trim())) return 'Každý vybraný hráč musí mít jméno.'
  const normalized = players.map((player) => player.name.trim().toLocaleLowerCase('cs'))
  if (new Set(normalized).size !== players.length) return 'Každý hráč musí mít unikátní jméno.'
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
  return new Set(history.filter((game) => game.origin !== 'riot-import').slice(-cooldownGames).flatMap((game) => game.slots.map((slot) => slot.champion.id)))
}

export function getCooldownEntries(history: ConfirmedGame[], cooldownGames: number): CooldownEntry[] {
  if (cooldownGames <= 0) return []
  const result = new Map<number, CooldownEntry>()
  history.filter((game) => game.origin !== 'riot-import').slice(-cooldownGames).forEach((game, offset, recentGames) => {
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
  playerRoles: Array<{ player: DraftPlayer; role: Role }>,
  dataset: MetaDataset,
  settings: Settings,
  blocked: Set<number>,
  random: RandomSource,
  reservedChampionIds: Set<number> = new Set(),
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
  const used = new Set(reservedChampionIds)

  const visit = (index: number): boolean => {
    if (index === candidates.length) return true
    const assignment = candidates[index]
    for (const champion of assignment.candidates) {
      if (used.has(champion.id)) continue
      used.add(champion.id)
      chosen.set(assignment.originalIndex, {
        playerId: assignment.player.id,
        player: assignment.player.name.trim(),
        riotId: assignment.player.riotId.trim(),
        role: assignment.role,
        champion,
      })
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
  players: DraftPlayer[],
  dataset: MetaDataset,
  settings: Settings,
  history: ConfirmedGame[],
  random: RandomSource = Math.random,
  fixedRoles?: Role[],
): Draft {
  const error = validatePlayers(players)
  if (error) throw new Error(error)
  if (fixedRoles && (fixedRoles.length !== players.length || new Set(fixedRoles).size !== players.length)) {
    throw new Error('Pevné rozdělení musí pro každého hráče obsahovat unikátní roli.')
  }
  const roles = fixedRoles ?? shuffle(ROLES, random).slice(0, players.length)
  const assignments = players.map((player, index) => ({ player, role: roles[index] }))
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

export function changePlayerRole(
  draft: Draft,
  slotIndex: number,
  nextRole: Role,
  dataset: MetaDataset,
  settings: Settings,
  history: ConfirmedGame[],
  random: RandomSource = Math.random,
): Draft {
  const slot = draft.slots[slotIndex]
  if (!slot) throw new Error('Hráč v návrhu neexistuje.')
  if (slot.role === nextRole) return draft

  const swappedIndex = draft.slots.findIndex((candidate, index) => index !== slotIndex && candidate.role === nextRole)
  const changedIndices = swappedIndex >= 0 ? [slotIndex, swappedIndex] : [slotIndex]
  const assignments = changedIndices.map((index) => {
    const current = draft.slots[index]
    return {
      player: { id: current.playerId, name: current.player, riotId: current.riotId },
      role: index === slotIndex ? nextRole : slot.role,
    }
  })
  const reserved = new Set(draft.slots.filter((_, index) => !changedIndices.includes(index)).map((item) => item.champion.id))
  const replacements = assignChampions(
    assignments,
    dataset,
    settings,
    getBlockedChampionIds(history, settings.cooldownGames),
    random,
    reserved,
  )
  if (!replacements) throw new Error('Pro změnu linek není dost dostupných šampionů. Zkus snížit filtry nebo cooldown.')

  const replacementByIndex = new Map(changedIndices.map((index, assignmentIndex) => [index, replacements[assignmentIndex]]))
  return {
    ...draft,
    id: createDraftId(),
    createdAt: new Date().toISOString(),
    slots: draft.slots.map((current, index) => replacementByIndex.get(index) ?? current),
  }
}

export function confirmDraft(draft: Draft, history: ConfirmedGame[], confirmedAt = new Date().toISOString()): ConfirmedGame[] {
  if (history.some((game) => game.id === draft.id)) return history
  const number = history.reduce((max, game) => Math.max(max, game.number), 0) + 1
  const canSync = draft.slots.every((slot) => slot.riotId.includes('#'))
  return [...history, {
    ...draft,
    number,
    confirmedAt,
    origin: 'confirmed',
    match: null,
    sync: {
      status: canSync ? 'pending' : 'untracked',
      lastAttemptAt: null,
      message: canSync ? 'Čekám, až se hra objeví v Riot match history.' : 'Pro automatické statistiky doplň všem hráčům Riot ID.',
    },
  }]
}
