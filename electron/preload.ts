import { contextBridge, ipcRenderer } from 'electron'
import type { MatchSummary, MatchSyncRequest, MatchSyncResult, Player, RecentMatchesImportRequest, RecentMatchesImportResult, RosterFileResult, StatisticsFileResult } from '../src/types'

contextBridge.exposeInMainWorld('desktop', Object.freeze({
  isElectron: true,
  platform: process.platform,
  matches: Object.freeze({
    syncGame: (request: MatchSyncRequest): Promise<MatchSyncResult> => ipcRenderer.invoke('matches:sync-game', request),
    importRecentMatches: (request: RecentMatchesImportRequest): Promise<RecentMatchesImportResult> => ipcRenderer.invoke('matches:import-recent', request),
  }),
  roster: Object.freeze({
    load: (): Promise<RosterFileResult> => ipcRenderer.invoke('roster:load'),
    save: (players: Player[]): Promise<RosterFileResult> => ipcRenderer.invoke('roster:save', players),
  }),
  statistics: Object.freeze({
    load: (): Promise<StatisticsFileResult> => ipcRenderer.invoke('statistics:load'),
    save: (matches: MatchSummary[]): Promise<StatisticsFileResult> => ipcRenderer.invoke('statistics:save', matches),
  }),
}))
