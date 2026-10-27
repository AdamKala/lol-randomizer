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
  damageSamples: number
  gold: number
  goldSamples: number
  vision: number
  visionSamples: number
  cs: number
  performance: number
  performanceSamples: number
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
        damageSamples: 0,
        gold: 0,
        goldSamples: 0,
        vision: 0,
        visionSamples: 0,
        cs: 0,
        performance: 0,
        performanceSamples: 0,
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
      if (participant.detailedStats) {
        current.damage += participant.totalDamageDealtToChampions
        current.damageSamples += 1
        current.gold += participant.goldEarned
        current.goldSamples += 1
        current.vision += participant.visionScore
        current.visionSamples += 1
      }
      if (participant.performanceScore > 0) {
        current.performance += participant.performanceScore
        current.performanceSamples += 1
      }
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
      damageSamples: row.damageSamples,
      gold: row.gold,
      goldSamples: row.goldSamples,
      vision: row.vision,
      visionSamples: row.visionSamples,
      cs: row.cs,
      performance: row.performance,
      performanceSamples: row.performanceSamples,
      favoriteChampion: row.favoriteChampion,
    }))
    .sort((a, b) => b.games - a.games || b.wins - a.wins || a.displayName.localeCompare(b.displayName, 'cs'))
}
