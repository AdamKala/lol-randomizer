import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import electronPath from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'

const electronExecutable = electronPath as unknown as string
let electronApp: ChildProcess | null = null
let restartQueue = Promise.resolve()

async function stopElectron(): Promise<void> {
  const running = electronApp
  electronApp = null
  if (!running || running.exitCode !== null) return
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 2_000)
    running.once('exit', () => { clearTimeout(timeout); resolve() })
    running.kill('SIGTERM')
  })
  if (running.exitCode === null) running.kill('SIGKILL')
}

function restartElectron(): Promise<void> {
  restartQueue = restartQueue.then(async () => {
    await stopElectron()
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    delete env.ELECTRON_NO_ATTACH_CONSOLE
    const child: ChildProcess = spawn(electronExecutable, ['.'], { env, stdio: 'inherit' })
    electronApp = child
    child.once('error', (error) => console.error(`Electron se nepodařilo spustit: ${error.message}`))
    child.once('exit', (code) => {
      if (electronApp !== child) return
      electronApp = null
      process.exit(code ?? 0)
    })
  })
  return restartQueue
}

process.once('exit', () => { if (electronApp?.exitCode === null) electronApp.kill('SIGTERM') })

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        onstart: restartElectron,
      },
      preload: { input: 'electron/preload.ts', onstart: restartElectron },
    }),
  ],
  base: './',
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
