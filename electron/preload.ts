import { contextBridge, ipcRenderer } from 'electron'
import type { MatchSyncRequest, MatchSyncResult, RiotApiStatus } from '../src/types'

contextBridge.exposeInMainWorld('desktop', Object.freeze({
  isElectron: true,
  platform: process.platform,
  riot: Object.freeze({
    getStatus: (): Promise<RiotApiStatus> => ipcRenderer.invoke('riot:get-status'),
    setApiKey: (apiKey: string): Promise<RiotApiStatus> => ipcRenderer.invoke('riot:set-api-key', apiKey),
    syncGame: (request: MatchSyncRequest): Promise<MatchSyncResult> => ipcRenderer.invoke('riot:sync-game', request),
  }),
}))
