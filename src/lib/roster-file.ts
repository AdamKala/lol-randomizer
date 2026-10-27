import type { Player, RosterFile } from '../types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function validateRosterPlayers(value: unknown): Player[] {
  if (!Array.isArray(value) || value.length > 50) throw new Error('Roster musí být pole s nejvýše 50 hráči.')
  const players = value.map((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id || item.id.length > 100) throw new Error('Hráč nemá platné ID.')
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 40) throw new Error('Hráč nemá platné jméno.')
    if (typeof item.riotId !== 'string' || item.riotId.length > 81 || (item.riotId && !item.riotId.includes('#'))) throw new Error(`Hráč ${item.name} nemá platné Riot ID.`)
    return { id: item.id, name: item.name.trim(), riotId: item.riotId.trim() }
  })
  if (new Set(players.map((player) => player.id)).size !== players.length) throw new Error('Roster obsahuje duplicitní interní ID.')
  if (new Set(players.map((player) => player.name.toLocaleLowerCase('cs'))).size !== players.length) throw new Error('Roster obsahuje duplicitní jméno.')
  return players
}

export function parseRosterFile(value: unknown): RosterFile {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.updatedAt !== 'string') throw new Error('Soubor hráčů nemá podporovaný formát.')
  return { schemaVersion: 1, updatedAt: value.updatedAt, players: validateRosterPlayers(value.players) }
}

export function createRosterFile(players: unknown, updatedAt = new Date().toISOString()): RosterFile {
  return { schemaVersion: 1, updatedAt, players: validateRosterPlayers(players) }
}
