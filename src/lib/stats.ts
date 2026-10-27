import type { ConfirmedGame } from '../types'

export interface PlayerAggregate {
  playerId: string
  displayName: string
  games: number
  wins: number
  losses: number
  kills: number
  deaths: number
  assists: number
  damage: number
  vision: number
  cs: number
  favoriteChampion: string
}

export function calculatePlayerStats(history: ConfirmedGame[]): PlayerAggregate[] {
  const rows = new Map<string, PlayerAggregate & { champions: Map<string, number> }>()
  for (const game of history) {
    if (!game.match) continue
    for (const participant of game.match.participants) {
      const current = rows.get(participant.playerId) ?? {
        playerId: participant.playerId,
        displayName: participant.displayName,
        games: 0,
        wins: 0,
        losses: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        damage: 0,
        vision: 0,
        cs: 0,
        favoriteChampion: participant.championName,
        champions: new Map<string, number>(),
      }
      current.displayName = participant.displayName
      current.games += 1
      current.wins += participant.win ? 1 : 0
      current.losses += participant.win ? 0 : 1
      current.kills += participant.kills
      current.deaths += participant.deaths
      current.assists += participant.assists
      current.damage += participant.totalDamageDealtToChampions
      current.vision += participant.visionScore
      current.cs += participant.totalMinionsKilled + participant.neutralMinionsKilled
      current.champions.set(participant.championName, (current.champions.get(participant.championName) ?? 0) + 1)
      current.favoriteChampion = [...current.champions.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
      rows.set(participant.playerId, current)
    }
  }
  return [...rows.values()]
    .map((row) => ({
      playerId: row.playerId,
      displayName: row.displayName,
      games: row.games,
      wins: row.wins,
      losses: row.losses,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      damage: row.damage,
      vision: row.vision,
      cs: row.cs,
      favoriteChampion: row.favoriteChampion,
    }))
    .sort((a, b) => b.games - a.games || b.wins - a.wins || a.displayName.localeCompare(b.displayName, 'cs'))
}
