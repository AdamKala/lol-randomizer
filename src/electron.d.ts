export {}

import type { MatchSyncRequest, MatchSyncResult, Player, RecentMatchesImportRequest, RecentMatchesImportResult, RosterFileResult } from './types'

declare global {
  interface Window {
    desktop?: Readonly<{
      isElectron: true
      platform: NodeJS.Platform
      matches: Readonly<{
        syncGame: (request: MatchSyncRequest) => Promise<MatchSyncResult>
        importRecentMatches: (request: RecentMatchesImportRequest) => Promise<RecentMatchesImportResult>
      }>
      roster: Readonly<{
        load: () => Promise<RosterFileResult>
        save: (players: Player[]) => Promise<RosterFileResult>
      }>
    }>
  }
}
