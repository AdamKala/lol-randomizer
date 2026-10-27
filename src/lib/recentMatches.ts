import { ROLES, type ChampionRoleEntry, type ConfirmedGame, type MatchParticipantStats, type MatchSummary, type MetaDataset, type Role } from '../types'
import { mergeMatchSummaries } from './statistics-file'

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

export function mergeRecentMatches(history: ConfirmedGame[], matches: MatchSummary[], dataset: MetaDataset): { history: ConfirmedGame[]; added: number; updated: number } {
  const knownMatchIds = new Set(history.flatMap((game) => game.match ? [game.match.matchId] : []))
  const confirmedMatchIds = new Set(history.flatMap((game) => (!game.origin || game.origin === 'confirmed') && game.match ? [game.match.matchId] : []))
  const uniqueMatches = new Map(mergeMatchSummaries(matches).map((match) => [match.matchId, match]))
  const retained = history
    .filter((game) => !(game.match && (game.origin === 'opgg-import' || game.origin === 'riot-import') && confirmedMatchIds.has(game.match.matchId)))
    .map((game) => {
      if (!game.match) return game
      const incoming = uniqueMatches.get(game.match.matchId)
      if (!incoming) return game
      uniqueMatches.delete(game.match.matchId)
      return { ...game, match: mergeMatchSummaries([game.match, incoming])[0], sync: { status: 'synced' as const, lastAttemptAt: incoming.fetchedAt, message: null } }
    })
  const importedGames = [...uniqueMatches.values()].map((match) => importedGame(match, dataset))
  let confirmedNumber = 0
  let importedNumber = 0
  const merged = [...retained, ...importedGames]
    .sort((left, right) => Date.parse(left.confirmedAt) - Date.parse(right.confirmedAt) || left.id.localeCompare(right.id))
    .map((game) => ({ ...game, number: game.origin === 'opgg-import' || game.origin === 'riot-import' ? ++importedNumber : ++confirmedNumber }))
  const incomingIds = new Set(matches.map((match) => match.matchId))
  const added = [...incomingIds].filter((matchId) => !knownMatchIds.has(matchId)).length
  return { history: merged, added, updated: incomingIds.size - added }
}
