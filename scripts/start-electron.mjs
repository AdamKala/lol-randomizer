import electronPath from 'electron'
import { spawn } from 'node:child_process'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_NO_ATTACH_CONSOLE

const child = spawn(electronPath, ['.'], { env, stdio: 'inherit' })

child.once('error', (error) => {
  console.error(`Electron se nepodařilo spustit: ${error.message}`)
  process.exitCode = 1
})

child.once('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exitCode = code ?? 1
})
