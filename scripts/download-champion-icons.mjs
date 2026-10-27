import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const datasetPath = join(root, 'public', 'data', 'champion-roles.v1.json')
const outputDirectory = join(root, 'public', 'champions')
const dataset = JSON.parse(await readFile(datasetPath, 'utf8'))
const slugs = [...new Set(dataset.entries.map((entry) => entry.slug))].sort()

await mkdir(outputDirectory, { recursive: true })

let downloaded = 0
let skipped = 0

async function download(slug) {
  const outputPath = join(outputDirectory, `${slug}.png`)
  try {
    await access(outputPath)
    skipped += 1
    return
  } catch {
    // Soubor ještě neexistuje.
  }

  const url = `https://ddragon.leagueoflegends.com/cdn/${dataset.ddragonVersion}/img/champion/${slug}.png`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${slug}: HTTP ${response.status}`)
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()))
  downloaded += 1
}

const queue = [...slugs]
await Promise.all(Array.from({ length: 10 }, async () => {
  while (queue.length) {
    const slug = queue.shift()
    if (slug) await download(slug)
  }
}))

console.log(`Champion ikony: ${downloaded} staženo, ${skipped} již existovalo, ${slugs.length} celkem.`)
