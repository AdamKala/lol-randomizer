import { contextBridge, ipcRenderer } from 'electron'
import type { MatchSyncRequest, MatchSyncResult, Player, RiotApiStatus, RosterFileResult } from '../src/types'

contextBridge.exposeInMainWorld('desktop', Object.freeze({
  isElectron: true,
  platform: process.platform,
  riot: Object.freeze({
    getStatus: (): Promise<RiotApiStatus> => ipcRenderer.invoke('riot:get-status'),
    setApiKey: (apiKey: string): Promise<RiotApiStatus> => ipcRenderer.invoke('riot:set-api-key', apiKey),
    syncGame: (request: MatchSyncRequest): Promise<MatchSyncResult> => ipcRenderer.invoke('riot:sync-game', request),
  }),
  roster: Object.freeze({
    load: (): Promise<RosterFileResult> => ipcRenderer.invoke('roster:load'),
    save: (players: Player[]): Promise<RosterFileResult> => ipcRenderer.invoke('roster:save', players),
  }),
}))
