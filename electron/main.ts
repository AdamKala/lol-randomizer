import { app, BrowserWindow, Menu, net, protocol, session, shell } from 'electron'
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
    minWidth: 980,
    minHeight: 680,
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
        const result = await window.webContents.executeJavaScript(`(async () => {
          const dataset = await fetch('./data/champion-roles.v1.json').then((response) => response.json())
          const iconOk = await fetch('./champions/Aatrox.png').then((response) => response.ok)
          const storageKey = '__lol_randomizer_smoke__'
          const storageBefore = localStorage.getItem(storageKey)
          if (storageBefore === 'persisted') localStorage.removeItem(storageKey)
          else localStorage.setItem(storageKey, 'persisted')
          return {
            title: document.title,
            heading: document.querySelector('h1')?.textContent ?? '',
            entries: dataset.entries?.length ?? 0,
            iconOk,
            storageBefore,
          }
        })()`)
        console.log(`[electron-smoke] ${JSON.stringify(result)}`)
        const valid = result.heading.includes('LoL Randomizer') && result.entries > 100 && result.iconOk === true
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
