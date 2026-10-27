export const ROLES = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const
export const MATCH_REGIONS = ['eune', 'euw'] as const

export type Role = (typeof ROLES)[number]
export type MatchRegion = (typeof MATCH_REGIONS)[number]

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
  source: { name: string; url: string; scope: string; methodology: string }
  defaults: { minPickRate: number; minGames: number }
  entries: ChampionRoleEntry[]
}

export interface Player {
  id: string
  name: string
  riotId: string
}

export interface RosterFile {
  schemaVersion: 1
  updatedAt: string
  players: Player[]
}

export interface RosterFileResult {
  players: Player[]
  path: string
  gitTrackable: boolean
  exists: boolean
}

export type DraftPlayer = Player

export interface DraftSlot {
  playerId: string
  player: string
  riotId: string
  role: Role
  champion: ChampionRoleEntry
}

export interface Draft {
  id: string
  createdAt: string
  patch: string
  slots: DraftSlot[]
}

export type MatchSyncStatus = 'untracked' | 'pending' | 'error' | 'synced'

export interface MatchParticipantStats {
  playerId: string
  displayName: string
  riotId: string
  puuid: string
  championId: number
  championName: string
  teamId: number
  teamPosition: string
  kills: number
  deaths: number
  assists: number
  goldEarned: number
  visionScore: number
  totalDamageDealtToChampions: number
  totalMinionsKilled: number
  neutralMinionsKilled: number
  win: boolean
  detailedStats: boolean
  performanceScore: number
  performanceRank: number
}

export interface MatchSummary {
  matchId: string
  fetchedAt: string
  gameStartedAt: string
  gameEndedAt: string
  durationSeconds: number
  gameMode: string
  queueId: number
  mapId: number
  gameVersion: string
  source?: 'riot-api' | 'opgg'
  participants: MatchParticipantStats[]
}

export interface MatchSyncState {
  status: MatchSyncStatus
  lastAttemptAt: string | null
  message: string | null
}

export interface ConfirmedGame extends Draft {
  number: number
  confirmedAt: string
  origin?: 'confirmed' | 'riot-import' | 'opgg-import'
  match: MatchSummary | null
  sync: MatchSyncState
}

export interface Settings {
  cooldownGames: number
  minPickRate: number
  minGames: number
  theme: 'dark' | 'light'
  matchRegion: MatchRegion
}

export interface AppState {
  schemaVersion: 3
  players: Player[]
  selectedPlayerIds: string[]
  draft: Draft | null
  history: ConfirmedGame[]
  settings: Settings
  customDataset: MetaDataset | null
}

export interface CooldownEntry {
  champion: ChampionRoleEntry
  remainingGames: number
}

export interface MatchSyncRequest {
  gameId: string
  confirmedAt: string
  excludedMatchIds: string[]
  region: MatchRegion
  players: Array<{ playerId: string; displayName: string; riotId: string }>
}

export type MatchSyncResult =
  | { kind: 'matched'; match: MatchSummary }
  | { kind: 'pending'; message: string }

export interface RecentMatchesImportRequest {
  excludedMatchIds: string[]
  region: MatchRegion
  players: Array<{ playerId: string; displayName: string; riotId: string }>
}

export interface RecentMatchesImportResult {
  matches: MatchSummary[]
  playerCount: number
}
