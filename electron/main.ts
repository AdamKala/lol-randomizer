import { app, BrowserWindow, ipcMain, Menu, net, protocol, session, shell } from 'electron'
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { importRecentPublicMatches, syncPublicMatch } from './matches'
import { loadRosterFile, saveRosterFile } from './roster'
import { loadStatisticsFile, saveStatisticsFile } from './statistics'

const electronRoot = dirname(fileURLToPath(import.meta.url))
const rendererRoot = resolve(electronRoot, '../dist')
const developmentUrl = process.env.VITE_DEV_SERVER_URL

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

function rendererFileFromUrl(requestUrl: string): string | null {
  const url = new URL(requestUrl)
  const relativePath = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '') || 'index.html'
  if (isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..')) return null
  const target = resolve(rendererRoot, relativePath)
  return target === rendererRoot || target.startsWith(`${rendererRoot}${sep}`) ? target : null
}

function isTrustedRendererUrl(targetUrl: string): boolean {
  try {
    const target = new URL(targetUrl)
    if (target.protocol === 'app:' && target.host === 'bundle') return true
    return Boolean(developmentUrl && target.origin === new URL(developmentUrl).origin)
  } catch {
    return false
  }
}

function openExternalUrl(targetUrl: string): void {
  try {
    const protocolName = new URL(targetUrl).protocol
    if (protocolName === 'https:') void shell.openExternal(targetUrl)
  } catch {
    // Neplatné URL z rendereru se pouze ignoruje.
  }
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 860,
    minHeight: 640,
    show: false,
    backgroundColor: '#050a12',
    title: 'LoL Randomizer',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(electronRoot, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      devTools: Boolean(developmentUrl),
      navigateOnDragDrop: false,
      safeDialogs: true,
      spellcheck: false,
    },
  })

  window.once('ready-to-show', () => window.show())

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (isTrustedRendererUrl(url)) return
    event.preventDefault()
    openExternalUrl(url)
  })

  if (process.env.ELECTRON_SMOKE_TEST === '1') {
    window.webContents.once('did-finish-load', async () => {
      try {
        window.setSize(860, 640)
        await new Promise((resolve) => setTimeout(resolve, 100))
        const verifyRosterWrite = process.env.ELECTRON_SMOKE_TEST_ROSTER_WRITE === '1'
        const result = await window.webContents.executeJavaScript(`(async () => {
          const dataset = await fetch('./data/champion-roles.v1.json').then((response) => response.json())
          const iconOk = await fetch('./champions/Aatrox.png').then((response) => response.ok)
          await new Promise((resolve) => setTimeout(resolve, 150))
          const storageKey = '__lol_randomizer_smoke__'
          const storageBefore = localStorage.getItem(storageKey)
          if (storageBefore === 'persisted') localStorage.removeItem(storageKey)
          else localStorage.setItem(storageKey, 'persisted')
          const rosterStatus = typeof window.desktop?.roster?.load === 'function'
            ? await window.desktop.roster.load()
            : null
          const statisticsStatus = typeof window.desktop?.statistics?.load === 'function'
            ? await window.desktop.statistics.load()
            : null
          const rosterWriteOk = ${verifyRosterWrite ? "Boolean(rosterStatus && (await window.desktop.roster.save(rosterStatus.players)).exists)" : 'true'}
          document.documentElement.dataset.theme = 'light'
          await new Promise((resolve) => requestAnimationFrame(resolve))
          const lightTheme = getComputedStyle(document.documentElement).colorScheme === 'light'
            && getComputedStyle(document.body).backgroundColor === 'rgb(233, 239, 245)'
          const tabButtons = [...document.querySelectorAll('nav button')]
          const statisticsTab = tabButtons.find((button) => button.textContent?.trim() === 'Statistiky')
          const recentTab = tabButtons.find((button) => button.textContent?.trim() === 'Poslední hry')
          const generalTab = tabButtons.find((button) => button.textContent?.trim() === 'Obecné')
          statisticsTab?.click()
          await new Promise((resolve) => requestAnimationFrame(resolve))
          const statisticsPanel = [...document.querySelectorAll('h2')].some((heading) => heading.textContent?.trim().startsWith('Statistiky'))
          const damageSortButton = [...document.querySelectorAll('th button')].find((button) => button.textContent?.trim().startsWith('DMG Ø'))
          let statisticsSortingUi = true
          let groupInsightsUi = true
          let statisticsRowUi = true
          if (damageSortButton) {
            damageSortButton.click()
            await new Promise((resolve) => requestAnimationFrame(resolve))
            const descending = damageSortButton.closest('th')?.getAttribute('aria-sort') === 'descending'
            damageSortButton.click()
            await new Promise((resolve) => requestAnimationFrame(resolve))
            statisticsSortingUi = descending && damageSortButton.closest('th')?.getAttribute('aria-sort') === 'ascending'
            groupInsightsUi = document.body.textContent?.includes('Přehled pozic') === true && document.body.textContent?.includes('Kdo s kým vyhrává') === true && document.body.textContent?.includes('Kdo kde a co hraje') === true
            const statisticsRow = document.querySelector('tbody tr[role="link"]')
            statisticsRowUi = Boolean(statisticsRow && statisticsRow.getAttribute('aria-label')?.startsWith('Otevřít statistiky hráče'))
          }
          recentTab?.click()
          await new Promise((resolve) => requestAnimationFrame(resolve))
          const recentPanel = [...document.querySelectorAll('h2')].some((heading) => heading.textContent?.trim() === 'Poslední hry')
          const importButton = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Načíst hry')
          importButton?.click()
          await new Promise((resolve) => requestAnimationFrame(resolve))
          const importDialog = document.querySelector('[aria-labelledby="recent-import-title"]')
          const countInput = importDialog?.querySelector('input[type="number"]')
          const countInputHasNoMax = countInput ? !countInput.hasAttribute('max') : false
          const dateModeButton = [...(importDialog?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.trim() === 'Od data')
          dateModeButton?.click()
          await new Promise((resolve) => requestAnimationFrame(resolve))
          const dateInput = importDialog?.querySelector('input[placeholder="DD/MM/YYYY"]')
          const dateInputFormat = /^[0-9]{2}[/][0-9]{2}[/][0-9]{4}$/.test(dateInput?.value ?? '')
          const importDialogUi = Boolean(importDialog && countInput && countInputHasNoMax && dateModeButton && dateInput && dateInputFormat)
          const closeImportButton = importDialog?.querySelector('button[aria-label="Zavřít"]')
          closeImportButton?.click()
          await new Promise((resolve) => requestAnimationFrame(resolve))
          generalTab?.click()
          await new Promise((resolve) => requestAnimationFrame(resolve))
          const generateDraftButton = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Vygenerovat sestavu')
          if (!document.querySelector('.draft-card-stats')) {
            generateDraftButton?.click()
            await new Promise((resolve) => requestAnimationFrame(resolve))
          }
          const draftStats = document.querySelector('.draft-card-stats')
          const draftMetaUi = Boolean(
            draftStats?.textContent?.includes('Pickrate')
            && draftStats.textContent.includes('Winrate')
            && draftStats.textContent.includes('Největší counter')
            && draftStats.querySelector('.draft-card-counter small'),
          )
          const rosterPlayerButton = [...document.querySelectorAll('button')].find((button) => button.getAttribute('title')?.startsWith('Otevřít profil hráče'))
          rosterPlayerButton?.click()
          await new Promise((resolve) => requestAnimationFrame(resolve))
          const playerProfile = [...document.querySelectorAll('p')].some((paragraph) => paragraph.textContent?.trim() === 'Profil hráče')
          const playerProfileBack = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Zpět')
          const playerProfileUi = Boolean(rosterPlayerButton && playerProfile && playerProfileBack)
          playerProfileBack?.click()
          await new Promise((resolve) => requestAnimationFrame(resolve))
          generalTab?.click()
          await new Promise((resolve) => requestAnimationFrame(resolve))
          return {
            title: document.title,
            heading: document.querySelector('h1')?.textContent ?? '',
            entries: dataset.entries?.length ?? 0,
            iconOk,
            storageBefore,
            rosterUi: document.body.textContent?.includes('Stálý roster') === true,
            settingsUi: document.body.textContent?.includes('Nastavení') === true && document.body.textContent?.includes('Světlý') === true,
            lightTheme,
            responsiveViewport: document.documentElement.scrollWidth <= window.innerWidth,
            draftMetaUi,
            tabsUi: Boolean(generalTab && statisticsTab && recentTab && statisticsPanel && statisticsSortingUi && statisticsRowUi && groupInsightsUi && recentPanel && importDialogUi && playerProfileUi),
            tabDiagnostics: {
              generalTab: Boolean(generalTab),
              statisticsTab: Boolean(statisticsTab),
              recentTab: Boolean(recentTab),
              statisticsPanel,
              statisticsSortingUi,
              statisticsRowUi,
              groupInsightsUi,
              recentPanel,
              importButton: Boolean(importButton),
              importDialog: Boolean(importDialog),
              countInput: Boolean(countInput),
              countInputHasNoMax,
              dateModeButton: Boolean(dateModeButton),
              dateInput: Boolean(dateInput),
              dateInputFormat,
              playerProfileUi,
              draftMetaUi,
            },
            matchSyncBridge: typeof window.desktop?.matches?.syncGame === 'function',
            recentImportBridge: typeof window.desktop?.matches?.importRecentMatches === 'function',
            rosterBridge: Boolean(rosterStatus && Array.isArray(rosterStatus.players)),
            rosterWriteOk,
            statisticsBridge: Boolean(statisticsStatus && Array.isArray(statisticsStatus.matches)),
          }
        })()`)
        console.log(`[electron-smoke] ${JSON.stringify(result)}`)
        const valid = result.heading.includes('LoL Randomizer') && result.entries > 100 && result.iconOk === true && result.rosterUi === true && result.settingsUi === true && result.lightTheme === true && result.responsiveViewport === true && result.draftMetaUi === true && result.tabsUi === true && result.matchSyncBridge === true && result.recentImportBridge === true && result.rosterBridge === true && result.rosterWriteOk === true && result.statisticsBridge === true
        app.exit(valid ? 0 : 1)
      } catch (error) {
        console.error('[electron-smoke] selhal', error)
        app.exit(1)
      }
    })
    window.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
      console.error(`[electron-smoke] načítání selhalo: ${errorCode} ${errorDescription}`)
      app.exit(1)
    })
  }

  if (developmentUrl) void window.loadURL(developmentUrl)
  else void window.loadURL('app://bundle/index.html')

  return window
}

app.setAppUserModelId('cz.adamkala.lolrandomizer')

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)

  ipcMain.handle('matches:sync-game', (_event, request: unknown) => syncPublicMatch(request))
  ipcMain.handle('matches:import-recent', (_event, request: unknown) => importRecentPublicMatches(request))
  ipcMain.handle('roster:load', () => loadRosterFile())
  ipcMain.handle('roster:save', (_event, players: unknown) => saveRosterFile(players))
  ipcMain.handle('statistics:load', () => loadStatisticsFile())
  ipcMain.handle('statistics:save', (_event, matches: unknown) => saveStatisticsFile(matches))

  if (!developmentUrl) {
    protocol.handle('app', (request) => {
      const file = rendererFileFromUrl(request.url)
      if (!file) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(file).toString())
    })
  }

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
