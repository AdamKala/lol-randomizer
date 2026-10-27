import { ROLES, type ChampionRoleEntry, type ConfirmedGame, type MatchParticipantStats, type Player, type Role } from '../types'
import { roleFromTeamPosition } from './recentMatches'

export interface PlayerMatchRecord {
  gameId: string
  startedAt: string
  gameMode: string
  durationSeconds: number
  role: Role
  champion: ChampionRoleEntry | null
  participant: MatchParticipantStats
}

export interface PlayerChampionStats {
  championId: number
  championName: string
  champion: ChampionRoleEntry | null
  games: number
  wins: number
  kills: number
  deaths: number
  assists: number
  cs: number
  damage: number
  damageSamples: number
  gold: number
  goldSamples: number
  vision: number
  visionSamples: number
  performance: number
  performanceSamples: number
}

export interface PlayerRoleStats {
  role: Role
  games: number
  wins: number
}

export interface PlayerStrength {
  key: 'form' | 'kda' | 'damage' | 'farming' | 'vision' | 'performance'
  label: string
  value: string
  description: string
  score: number
}

export interface PlayerDetail {
  playerId: string
  displayName: string
  riotId: string
  games: number
  wins: number
  losses: number
  kills: number
  deaths: number
  assists: number
  cs: number
  damage: number
  damageSamples: number
  gold: number
  goldSamples: number
  vision: number
  visionSamples: number
  performance: number
  performanceSamples: number
  durationMinutes: number
  durationSamples: number
  mvpCount: number
  topThreeCount: number
  matches: PlayerMatchRecord[]
  champions: PlayerChampionStats[]
  roles: PlayerRoleStats[]
  strengths: PlayerStrength[]
}

function decimal(value: number): string {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(value)
}

function percentage(value: number): string {
  return `${decimal(value)} %`
}

export function buildPlayerDetail(history: ConfirmedGame[], player: Pick<Player, 'id' | 'name' | 'riotId'>): PlayerDetail {
  const matches: PlayerMatchRecord[] = []
  for (const game of history) {
    if (!game.match) continue
    const participant = game.match.participants.find((item) => item.playerId === player.id)
    if (!participant) continue
    const slot = game.slots.find((item) => item.playerId === player.id)
    matches.push({
      gameId: game.match.matchId,
      startedAt: game.match.gameStartedAt || game.confirmedAt,
      gameMode: game.match.gameMode,
      durationSeconds: game.match.durationSeconds,
      role: slot?.role ?? roleFromTeamPosition(participant.teamPosition),
      champion: slot?.champion ?? null,
      participant,
    })
  }
  matches.sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))

  const detail: PlayerDetail = {
    playerId: player.id,
    displayName: matches[0]?.participant.displayName || player.name,
    riotId: matches[0]?.participant.riotId || player.riotId,
    games: matches.length,
    wins: 0,
    losses: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    cs: 0,
    damage: 0,
    damageSamples: 0,
    gold: 0,
    goldSamples: 0,
    vision: 0,
    visionSamples: 0,
    performance: 0,
    performanceSamples: 0,
    durationMinutes: 0,
    durationSamples: 0,
    mvpCount: 0,
    topThreeCount: 0,
    matches,
    champions: [],
    roles: [],
    strengths: [],
  }

  const champions = new Map<string, PlayerChampionStats>()
  const roles = new Map<Role, PlayerRoleStats>()
  for (const match of matches) {
    const participant = match.participant
    const cs = participant.totalMinionsKilled + participant.neutralMinionsKilled
    detail.wins += participant.win ? 1 : 0
    detail.losses += participant.win ? 0 : 1
    detail.kills += participant.kills
    detail.deaths += participant.deaths
    detail.assists += participant.assists
    detail.cs += cs
    if (participant.detailedStats) {
      detail.damage += participant.totalDamageDealtToChampions
      detail.damageSamples += 1
      detail.gold += participant.goldEarned
      detail.goldSamples += 1
      detail.vision += participant.visionScore
      detail.visionSamples += 1
    }
    if (participant.performanceScore > 0) {
      detail.performance += participant.performanceScore
      detail.performanceSamples += 1
    }
    if (match.durationSeconds > 0) {
      detail.durationMinutes += match.durationSeconds / 60
      detail.durationSamples += 1
    }
    detail.mvpCount += participant.performanceRank === 1 ? 1 : 0
    detail.topThreeCount += participant.performanceRank > 0 && participant.performanceRank <= 3 ? 1 : 0

    const championKey = participant.championId > 0 ? String(participant.championId) : participant.championName.toLocaleLowerCase('en')
    const champion = champions.get(championKey) ?? {
      championId: participant.championId,
      championName: participant.championName,
      champion: match.champion,
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      cs: 0,
      damage: 0,
      damageSamples: 0,
      gold: 0,
      goldSamples: 0,
      vision: 0,
      visionSamples: 0,
      performance: 0,
      performanceSamples: 0,
    }
    champion.champion ??= match.champion
    champion.games += 1
    champion.wins += participant.win ? 1 : 0
    champion.kills += participant.kills
    champion.deaths += participant.deaths
    champion.assists += participant.assists
    champion.cs += cs
    if (participant.detailedStats) {
      champion.damage += participant.totalDamageDealtToChampions
      champion.damageSamples += 1
      champion.gold += participant.goldEarned
      champion.goldSamples += 1
      champion.vision += participant.visionScore
      champion.visionSamples += 1
    }
    if (participant.performanceScore > 0) {
      champion.performance += participant.performanceScore
      champion.performanceSamples += 1
    }
    champions.set(championKey, champion)

    const role = roles.get(match.role) ?? { role: match.role, games: 0, wins: 0 }
    role.games += 1
    role.wins += participant.win ? 1 : 0
    roles.set(match.role, role)
  }

  detail.champions = [...champions.values()].sort((left, right) => right.games - left.games || right.wins - left.wins || left.championName.localeCompare(right.championName, 'cs'))
  detail.roles = [...roles.values()].sort((left, right) => right.games - left.games || ROLES.indexOf(left.role) - ROLES.indexOf(right.role))

  if (detail.games) {
    const winRate = (detail.wins / detail.games) * 100
    const kda = (detail.kills + detail.assists) / Math.max(1, detail.deaths)
    const detailedDurationMinutes = matches.reduce((total, match) => total + (match.participant.detailedStats && match.durationSeconds > 0 ? match.durationSeconds / 60 : 0), 0)
    const damagePerMinute = detailedDurationMinutes > 0 ? detail.damage / detailedDurationMinutes : 0
    const csPerMinute = detail.durationMinutes > 0 ? detail.cs / detail.durationMinutes : 0
    const visionPerGame = detail.visionSamples ? detail.vision / detail.visionSamples : 0
    const performance = detail.performanceSamples ? detail.performance / detail.performanceSamples : 0
    const strengths: PlayerStrength[] = [
      { key: 'form', label: 'Vítězná forma', value: percentage(winRate), description: `${detail.wins} výher z ${detail.games} uložených her.`, score: winRate / 55 },
      { key: 'kda', label: 'Souboje a přežití', value: `${decimal(kda)} KDA`, description: `Průměr ${decimal(detail.kills / detail.games)} / ${decimal(detail.deaths / detail.games)} / ${decimal(detail.assists / detail.games)}.`, score: kda / 3 },
      { key: 'damage', label: 'Tlak damage', value: `${Math.round(damagePerMinute).toLocaleString('cs-CZ')} DMG/min`, description: detail.damageSamples ? `Průměrně ${Math.round(detail.damage / detail.damageSamples).toLocaleString('cs-CZ')} damage za hru.` : 'Detailní damage zatím není dostupný.', score: damagePerMinute / 600 },
      { key: 'farming', label: 'Farming', value: `${decimal(csPerMinute)} CS/min`, description: `Průměrně ${decimal(detail.cs / detail.games)} CS za hru.`, score: csPerMinute / 7 },
      { key: 'vision', label: 'Kontrola mapy', value: `${decimal(visionPerGame)} vision`, description: 'Průměrné vision score v hrách s dostupným detailem.', score: visionPerGame / 25 },
      { key: 'performance', label: 'OP.GG výkon', value: performance ? decimal(performance) : '—', description: `${detail.mvpCount}× MVP a ${detail.topThreeCount}× umístění v TOP 3.`, score: performance / 7 },
    ]
    detail.strengths = strengths.filter((strength) => strength.value !== '—' && !strength.value.startsWith('0,0 ')).sort((left, right) => right.score - left.score).slice(0, 3)
  }

  return detail
}
