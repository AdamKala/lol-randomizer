import { ROLES, type ChampionRoleEntry, type ConfirmedGame, type MatchParticipantStats, type MatchSummary, type MetaDataset, type Role } from '../types'

export function roleFromTeamPosition(position: string, fallbackIndex = 0): Role {
  switch (position.toUpperCase()) {
    case 'TOP': return 'TOP'
    case 'JUNGLE': return 'JUNGLE'
    case 'MIDDLE':
    case 'MID': return 'MID'
    case 'BOTTOM':
    case 'BOT':
    case 'CARRY': return 'ADC'
    case 'UTILITY':
    case 'SUPPORT': return 'SUPPORT'
    default: return ROLES[fallbackIndex % ROLES.length]
  }
}

function championFor(participant: MatchParticipantStats, role: Role, dataset: MetaDataset): ChampionRoleEntry {
  const candidates = dataset.entries.filter((entry) => entry.id === participant.championId || entry.name.toLocaleLowerCase('en') === participant.championName.toLocaleLowerCase('en'))
  const known = candidates.find((entry) => entry.role === role) ?? candidates[0]
  if (known) return { ...known, role }
  return {
    id: participant.championId,
    slug: participant.championName,
    name: participant.championName,
    role,
    pickRate: 0,
    games: 0,
  }
}

function importedGame(match: MatchSummary, dataset: MetaDataset): ConfirmedGame {
  const startedAt = Number.isFinite(Date.parse(match.gameStartedAt)) ? match.gameStartedAt : match.fetchedAt
  return {
    id: `riot-${match.matchId}`,
    createdAt: startedAt,
    confirmedAt: startedAt,
    patch: match.gameVersion.split('.').slice(0, 2).join('.') || dataset.patch,
    number: 0,
    origin: 'opgg-import',
    slots: match.participants.map((participant, index) => {
      const role = roleFromTeamPosition(participant.teamPosition, index)
      return {
        playerId: participant.playerId,
        player: participant.displayName,
        riotId: participant.riotId,
        role,
        champion: championFor(participant, role, dataset),
      }
    }),
    match,
    sync: { status: 'synced', lastAttemptAt: match.fetchedAt, message: 'Načteno z posledních Riot zápasů.' },
  }
}

export function mergeRecentMatches(history: ConfirmedGame[], matches: MatchSummary[], dataset: MetaDataset): { history: ConfirmedGame[]; added: number } {
  const knownMatchIds = new Set(history.flatMap((game) => game.match ? [game.match.matchId] : []))
  const uniqueMatches = new Map<string, MatchSummary>()
  for (const match of matches) {
    if (!knownMatchIds.has(match.matchId)) uniqueMatches.set(match.matchId, match)
  }
  const addedGames = [...uniqueMatches.values()].map((match) => importedGame(match, dataset))
  const merged = [...history, ...addedGames]
    .sort((left, right) => Date.parse(left.confirmedAt) - Date.parse(right.confirmedAt) || left.id.localeCompare(right.id))
    .map((game, index) => ({ ...game, number: index + 1 }))
  return { history: merged, added: addedGames.length }
}
