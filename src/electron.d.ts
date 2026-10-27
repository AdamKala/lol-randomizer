export {}

import type { MatchSyncRequest, MatchSyncResult, RiotApiStatus } from './types'

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
    }>
  }
}
