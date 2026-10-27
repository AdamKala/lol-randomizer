import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        async onstart({ startup }) {
          const env = { ...process.env }
          delete env.ELECTRON_RUN_AS_NODE
          delete env.ELECTRON_NO_ATTACH_CONSOLE
          await startup(['.'], { env })
        },
      },
      preload: { input: 'electron/preload.ts' },
    }),
  ],
  base: './',
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
