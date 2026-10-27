import { ROLES, type ConfirmedGame, type Role } from '../types'
import { roleFromTeamPosition } from './recentMatches'

export interface GroupRoleInsight {
  role: Role
  games: number
  wins: number
  topPlayerId: string
  topPlayerName: string
  topPlayerGames: number
}

export interface GroupPlayerPreference {
  playerId: string
  displayName: string
  games: number
  wins: number
  primaryRole: Role
  primaryRoleGames: number
  favoriteChampion: string
  favoriteChampionGames: number
  roles: Array<{ role: Role; games: number; wins: number }>
}

export interface PlayerPairInsight {
  playerIds: [string, string]
  playerNames: [string, string]
  games: number
  wins: number
  losses: number
}

export interface GroupInsights {
  roles: GroupRoleInsight[]
  players: GroupPlayerPreference[]
  pairs: PlayerPairInsight[]
}

interface MutablePlayer {
  playerId: string
  displayName: string
  games: number
  wins: number
  roles: Map<Role, { games: number; wins: number }>
  champions: Map<string, number>
}

export function buildGroupInsights(history: ConfirmedGame[]): GroupInsights {
  const roles = new Map<Role, { games: number; wins: number; players: Map<string, { name: string; games: number }> }>()
  const players = new Map<string, MutablePlayer>()
  const pairs = new Map<string, PlayerPairInsight>()
  const seenMatches = new Set<string>()

  for (const game of history) {
    if (!game.match || seenMatches.has(game.match.matchId)) continue
    seenMatches.add(game.match.matchId)
    const participants = game.match.participants.map((participant, index) => {
      const slot = game.slots.find((item) => item.playerId === participant.playerId)
      return { participant, role: slot?.role ?? roleFromTeamPosition(participant.teamPosition, index) }
    })

    for (const { participant, role } of participants) {
      const roleStats = roles.get(role) ?? { games: 0, wins: 0, players: new Map<string, { name: string; games: number }>() }
      roleStats.games += 1
      roleStats.wins += participant.win ? 1 : 0
      const rolePlayer = roleStats.players.get(participant.playerId) ?? { name: participant.displayName, games: 0 }
      rolePlayer.name = participant.displayName
      rolePlayer.games += 1
      roleStats.players.set(participant.playerId, rolePlayer)
      roles.set(role, roleStats)

      const player = players.get(participant.playerId) ?? { playerId: participant.playerId, displayName: participant.displayName, games: 0, wins: 0, roles: new Map(), champions: new Map() }
      player.displayName = participant.displayName
      player.games += 1
      player.wins += participant.win ? 1 : 0
      const playerRole = player.roles.get(role) ?? { games: 0, wins: 0 }
      playerRole.games += 1
      playerRole.wins += participant.win ? 1 : 0
      player.roles.set(role, playerRole)
      player.champions.set(participant.championName, (player.champions.get(participant.championName) ?? 0) + 1)
      players.set(participant.playerId, player)
    }

    for (let leftIndex = 0; leftIndex < participants.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < participants.length; rightIndex += 1) {
        const left = participants[leftIndex].participant
        const right = participants[rightIndex].participant
        if (left.win !== right.win || (left.teamId > 0 && right.teamId > 0 && left.teamId !== right.teamId)) continue
        const ordered = [left, right].sort((a, b) => a.playerId.localeCompare(b.playerId))
        const key = `${ordered[0].playerId}|${ordered[1].playerId}`
        const pair = pairs.get(key) ?? { playerIds: [ordered[0].playerId, ordered[1].playerId], playerNames: [ordered[0].displayName, ordered[1].displayName], games: 0, wins: 0, losses: 0 }
        pair.playerNames = [ordered[0].displayName, ordered[1].displayName]
        pair.games += 1
        pair.wins += left.win ? 1 : 0
        pair.losses += left.win ? 0 : 1
        pairs.set(key, pair)
      }
    }
  }

  return {
    roles: ROLES.map((role) => {
      const stats = roles.get(role) ?? { games: 0, wins: 0, players: new Map<string, { name: string; games: number }>() }
      const topPlayer = [...stats.players.entries()].sort((left, right) => right[1].games - left[1].games || left[1].name.localeCompare(right[1].name, 'cs'))[0]
      return { role, games: stats.games, wins: stats.wins, topPlayerId: topPlayer?.[0] ?? '', topPlayerName: topPlayer?.[1].name ?? '—', topPlayerGames: topPlayer?.[1].games ?? 0 }
    }).sort((left, right) => right.games - left.games || ROLES.indexOf(left.role) - ROLES.indexOf(right.role)),
    players: [...players.values()].map((player) => {
      const roleList = [...player.roles.entries()].map(([role, stats]) => ({ role, ...stats })).sort((left, right) => right.games - left.games || ROLES.indexOf(left.role) - ROLES.indexOf(right.role))
      const favoriteChampion = [...player.champions.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'cs'))[0]
      return { playerId: player.playerId, displayName: player.displayName, games: player.games, wins: player.wins, primaryRole: roleList[0]?.role ?? 'TOP', primaryRoleGames: roleList[0]?.games ?? 0, favoriteChampion: favoriteChampion?.[0] ?? '—', favoriteChampionGames: favoriteChampion?.[1] ?? 0, roles: roleList }
    }).sort((left, right) => right.games - left.games || left.displayName.localeCompare(right.displayName, 'cs')),
    pairs: [...pairs.values()].sort((left, right) => (right.wins / right.games) - (left.wins / left.games) || right.games - left.games || left.playerNames.join('').localeCompare(right.playerNames.join(''), 'cs')),
  }
}
