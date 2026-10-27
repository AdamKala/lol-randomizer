export const ROLES = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const

export type Role = (typeof ROLES)[number]

export interface ChampionRoleEntry {
  id: number
  slug: string
  name: string
  role: Role
  pickRate: number
  games: number
}

export interface MetaDataset {
  schemaVersion: 1
  patch: string
  ddragonVersion: string
  updatedAt: string
  staleAfterDays: number
  source: {
    name: string
    url: string
    scope: string
    methodology: string
  }
  defaults: {
    minPickRate: number
    minGames: number
  }
  entries: ChampionRoleEntry[]
}

export interface DraftSlot {
  player: string
  role: Role
  champion: ChampionRoleEntry
}

export interface Draft {
  id: string
  createdAt: string
  patch: string
  slots: DraftSlot[]
}

export interface ConfirmedGame extends Draft {
  number: number
  confirmedAt: string
}

export interface Settings {
  cooldownGames: number
  minPickRate: number
  minGames: number
}

export interface AppState {
  schemaVersion: 2
  players: string[]
  draft: Draft | null
  history: ConfirmedGame[]
  settings: Settings
  customDataset: MetaDataset | null
}

export interface CooldownEntry {
  champion: ChampionRoleEntry
  remainingGames: number
}
