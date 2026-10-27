import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const datasetPath = resolve(root, 'public/data/champion-roles.v1.json')
const ROLE_PATHS = { TOP: 'top', JUNGLE: 'jungle', MID: 'mid', ADC: 'adc', SUPPORT: 'support' }
const SLUG_OVERRIDES = { MonkeyKing: 'monkeyking' }
const REQUEST_DELAY_MS = 350
const MAX_ATTEMPTS = 3
const forceRefresh = process.argv.includes('--force')
const roleFilter = process.argv.find((argument) => argument.startsWith('--role='))?.slice('--role='.length).toUpperCase()

if (roleFilter && !Object.hasOwn(ROLE_PATHS, roleFilter)) {
  throw new Error(`Neznámá role ${roleFilter}. Použij TOP, JUNGLE, MID, ADC nebo SUPPORT.`)
}

const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds))
const roundRate = (value) => Math.round(value * 100) / 100

function parseRate(html, key) {
  const match = html.match(new RegExp(`\\\\"${key}\\\\":([0-9.]+)`))
  if (!match) throw new Error(`V odpovědi chybí ${key}.`)
  return Number(match[1])
}

function parseMatchups(html) {
  const marker = '],\\"targetChampion\\"'
  const end = html.indexOf(marker)
  const start = html.lastIndexOf('[{\\"play\\"', end)
  if (start < 0 || end < 0) throw new Error('V odpovědi chybí matchup data.')
  return JSON.parse(html.slice(start, end + 1).replaceAll('\\"', '"'))
}

function selectCounter(matchups) {
  return matchups
    .filter((matchup) => matchup.play > 0)
    .sort((left, right) => left.win_rate - right.win_rate || right.play - left.play)[0]
}

async function fetchEntry(entry) {
  const champion = SLUG_OVERRIDES[entry.slug] ?? entry.slug.toLowerCase()
  const position = ROLE_PATHS[entry.role]
  const url = `https://op.gg/lol/champions/${champion}/counters/${position}?region=global&tier=emerald_plus`
  let lastError

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LoL-Randomizer-Meta-Updater/1.0)' } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const html = await response.text()
      const stats = {
        winRate: parseRate(html, 'rateWin'),
        pickRate: parseRate(html, 'ratePick'),
      }
      try {
        const counter = selectCounter(parseMatchups(html))
        if (!counter) return stats
        return { ...stats, counter: {
          slug: counter.champion.key,
          name: counter.champion.name,
          winRateAgainst: counter.win_rate,
          games: counter.play,
        } }
      } catch {
        return stats
      }
    } catch (error) {
      lastError = error
      if (error instanceof Error && error.message.includes('chybí rate')) break
      if (attempt < MAX_ATTEMPTS) await wait(1000 * attempt)
    }
  }

  throw new Error(`${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

const dataset = JSON.parse(await readFile(datasetPath, 'utf8'))
const refreshed = []
const failures = []

for (const [index, entry] of dataset.entries.entries()) {
  if (roleFilter && entry.role !== roleFilter) {
    refreshed.push(entry)
    continue
  }
  if (entry.winRate !== undefined && entry.counter && !forceRefresh) {
    refreshed.push(entry)
    console.log(`[${index + 1}/${dataset.entries.length}] ${entry.role} ${entry.name}: data už jsou uložená`)
    continue
  }
  try {
    const stats = await fetchEntry(entry)
    refreshed.push({ ...entry, ...stats })
    console.log(`[${index + 1}/${dataset.entries.length}] ${entry.role} ${entry.name}: ${stats.pickRate.toFixed(2)} % pick · ${stats.winRate.toFixed(2)} % win · counter ${stats.counter?.name ?? 'bez dat'}`)
  } catch (error) {
    failures.push(`${entry.role} ${entry.name}: ${error instanceof Error ? error.message : String(error)}`)
    refreshed.push(entry)
    console.warn(`[${index + 1}/${dataset.entries.length}] CHYBA ${entry.role} ${entry.name}: ${error instanceof Error ? error.message : String(error)}`)
  }
  await wait(REQUEST_DELAY_MS)
}

dataset.entries = refreshed.map((entry) => ({
  ...entry,
  pickRate: roundRate(entry.pickRate),
  ...(entry.winRate === undefined ? {} : { winRate: roundRate(entry.winRate) }),
  ...(entry.counter ? { counter: {
    slug: entry.counter.slug,
    name: entry.counter.name,
    winRateAgainst: roundRate(entry.counter.winRateAgainst ?? entry.counter.winRate),
    games: entry.counter.games,
  } } : {}),
}))
dataset.updatedAt = new Date().toISOString().slice(0, 10)
dataset.source = {
  name: 'OP.GG + U.GG snapshot',
  url: 'https://op.gg/lol/champions',
  scope: 'Ranked Solo, Emerald+, Global; role-specific champion statistics',
  methodology: 'Výběr champion-role kombinací pochází z původního U.GG snapshotu, nikoli z Riot tříd. Pickrate a winrate jsou načtené z veřejných OP.GG stránek. Největší counter je první soupeř po seřazení veřejné OP.GG matchup tabulky od nejnižšího winratu daného picku, bez dodatečného filtru velikosti vzorku. Počet her zůstává z původního ručně kurátorovaného U.GG snapshotu.',
}

await writeFile(datasetPath, `${JSON.stringify(dataset, null, 2)}\n`)
console.log(`Hotovo: ${dataset.entries.length} kombinací uloženo do ${datasetPath}`)
if (failures.length) {
  console.warn(`Bez aktualizace zůstalo ${failures.length} položek:\n${failures.join('\n')}`)
}
