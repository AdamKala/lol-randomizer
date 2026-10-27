import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('desktop', Object.freeze({
  isElectron: true,
  platform: process.platform,
}))
