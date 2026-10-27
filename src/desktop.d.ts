export {}

import type { MatchSummary, MatchSyncRequest, MatchSyncResult, Player, RecentMatchesImportRequest, RecentMatchesImportResult, RosterFileResult, StatisticsFileResult } from './types'

declare global {
  interface Window {
    desktop?: Readonly<{
      isTauri: true
      platform: string
      matches: Readonly<{
        syncGame: (request: MatchSyncRequest) => Promise<MatchSyncResult>
        importRecentMatches: (request: RecentMatchesImportRequest) => Promise<RecentMatchesImportResult>
      }>
      roster: Readonly<{
        load: () => Promise<RosterFileResult>
        save: (players: Player[]) => Promise<RosterFileResult>
      }>
      statistics: Readonly<{
        load: () => Promise<StatisticsFileResult>
        save: (matches: MatchSummary[]) => Promise<StatisticsFileResult>
      }>
    }>
  }
}
