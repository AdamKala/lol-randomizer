export {}

import type { MatchSyncRequest, MatchSyncResult, Player, RiotApiStatus, RosterFileResult } from './types'

declare global {
  interface Window {
    desktop?: Readonly<{
      isElectron: true
      platform: NodeJS.Platform
      riot: Readonly<{
        getStatus: () => Promise<RiotApiStatus>
        setApiKey: (apiKey: string) => Promise<RiotApiStatus>
        syncGame: (request: MatchSyncRequest) => Promise<MatchSyncResult>
      }>
      roster: Readonly<{
        load: () => Promise<RosterFileResult>
        save: (players: Player[]) => Promise<RosterFileResult>
      }>
    }>
  }
}
