import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const bundledMetaDataset = JSON.parse(
  readFileSync(new URL('./public/data/champion-roles.v1.json', import.meta.url), 'utf8'),
) as unknown

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __LOL_RANDOMIZER_BUNDLED_META_DATASET__: JSON.stringify(bundledMetaDataset),
  },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
  },
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: 'esbuild',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
