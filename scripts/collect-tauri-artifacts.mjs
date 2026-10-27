import { cp, mkdir, readFile, readdir } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

const kind = process.argv[2]
const supported = new Set(['nsis', 'appimage', 'deb', 'dmg'])
if (!supported.has(kind)) throw new Error(`Neznámý typ Tauri balíčku: ${kind}`)

const root = resolve(import.meta.dirname, '..')
const target = join(root, 'src-tauri', 'target')
const release = join(root, 'release')
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))

async function directories(path) {
  return (await readdir(path, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => join(path, entry.name))
}

const candidates = [join(target, 'release', 'bundle', kind)]
for (const platformTarget of await directories(target).catch(() => [])) candidates.push(join(platformTarget, 'release', 'bundle', kind))

let bundleCopied = 0
let portableCopied = false
await mkdir(release, { recursive: true })
for (const candidate of candidates) {
  for (const entry of await readdir(candidate, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile()) continue
    const source = join(candidate, entry.name)
    const destination = join(release, basename(source).replace(/^LoL Randomizer_/, 'LoL-Randomizer-').replaceAll('_', '-'))
    await cp(source, destination)
    console.log(`Výsledný balíček: ${destination}`)
    bundleCopied += 1
  }
}

if (kind === 'nsis') {
  const releaseDirectories = [join(target, 'release')]
  for (const platformTarget of await directories(target).catch(() => [])) releaseDirectories.push(join(platformTarget, 'release'))
  for (const directory of releaseDirectories) {
    const source = join(directory, 'lol-randomizer.exe')
    try {
      const destination = join(release, `LoL-Randomizer-Portable-${packageJson.version}-x64.exe`)
      await cp(source, destination)
      console.log(`Přenosná aplikace: ${destination}`)
      portableCopied = true
      break
    } catch {
      // Binárka může být v jiné target složce; pokračujeme další možností.
    }
  }
}

if (!bundleCopied) throw new Error(`V Tauri target nebyl nalezen žádný balíček typu ${kind}.`)
if (kind === 'nsis' && !portableCopied) throw new Error('V Tauri target nebyla nalezena portable Windows binárka.')
