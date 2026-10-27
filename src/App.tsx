import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  Database,
  Dice5,
  Download,
  EllipsisVertical,
  History as HistoryIcon,
  KeyRound,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCw,
  Settings2,
  Shield,
  Shuffle,
  Swords,
  Trash2,
  Undo2,
  Upload,
  UserRoundCheck,
  Users,
  X,
} from 'lucide-react'
import { ROLES, type AppState, type ChampionRoleEntry, type ConfirmedGame, type Draft, type MetaDataset, type Player, type RiotApiStatus, type Role, type RosterFileResult, type Settings } from './types'
import { changePlayerRole, confirmDraft, generateDraft, getCooldownEntries, rerollOneChampion, validatePlayers } from './lib/randomizer'
import { isDatasetStale, loadBundledDataset, validateMetaDataset } from './lib/meta'
import { calculatePlayerStats } from './lib/stats'
import { mergeRecentMatches } from './lib/recentMatches'
import { createHistoryBackup, DEFAULT_STATE, loadState, saveState, validateHistoryBackup } from './lib/storage'

const ROLE_LABELS: Record<Role, { short: string; title: string; mark: string }> = {
  TOP: { short: 'TOP', title: 'Horní lajna', mark: 'T' },
  JUNGLE: { short: 'JUNGLE', title: 'Džungle', mark: 'J' },
  MID: { short: 'MID', title: 'Středová lajna', mark: 'M' },
  ADC: { short: 'ADC', title: 'Spodní lajna', mark: 'A' },
  SUPPORT: { short: 'SUPPORT', title: 'Podpora', mark: 'S' },
}

const dateTime = new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' })
const integer = new Intl.NumberFormat('cs-CZ')
const oneDecimal = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

function orderedByRole<T extends { role: Role }>(slots: readonly T[]): T[] {
  return [...slots].sort((left, right) => ROLES.indexOf(left.role) - ROLES.indexOf(right.role))
}

function createId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `player-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function RoleBadge({ role }: { role: Role }) {
  const data = ROLE_LABELS[role]
  return (
    <span className="inline-flex items-center gap-2 text-[.68rem] font-bold tracking-[.18em] text-cyan">
      <span className="grid size-7 place-items-center border border-cyan/30 bg-cyan/10 font-display text-xs text-[#76eee6] [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]">{data.mark}</span>
      <span>{data.short}</span>
    </span>
  )
}

function ChampionImage({ champion, className = '' }: { champion: ChampionRoleEntry; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <div className={`grid place-items-center bg-gradient-to-br from-[#12263b] to-[#080d16] text-4xl font-bold text-gold/60 ${className}`}>{champion.name.slice(0, 1)}</div>
  return <img src={`${import.meta.env.BASE_URL}champions/${champion.slug}.png`} alt={`Portrét šampiona ${champion.name}`} className={className} loading="lazy" onError={() => setFailed(true)} />
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`glass rounded-xl ${className}`}>{children}</section>
}

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function DraftCard({ slot, index, onReroll, onRoleChange }: { slot: Draft['slots'][number]; index: number; onReroll: () => void; onRoleChange: (role: Role) => void }) {
  return (
    <article className="group relative min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#091322] shadow-xl transition duration-300 hover:-translate-y-1 hover:border-gold/35 hover:shadow-gold" style={{ animationDelay: `${index * 65}ms` }}>
      <div className="relative aspect-[5/4] overflow-hidden bg-[#070d17]">
        <ChampionImage champion={slot.champion} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#091322] via-transparent to-transparent" />
        <div className="absolute left-3 top-3"><RoleBadge role={slot.role} /></div>
        <button type="button" onClick={onReroll} className="absolute right-3 top-3 grid size-10 place-items-center rounded-full border border-white/15 bg-[#050a12]/80 text-slate-200 backdrop-blur transition hover:rotate-180 hover:border-cyan/60 hover:text-cyan" aria-label={`Přelosovat šampiona pro ${slot.player}`} title="Přelosovat pouze tohoto šampiona"><RotateCw size={17} /></button>
      </div>
      <div className="relative -mt-3 px-4 pb-4">
        <p className="truncate text-xs font-semibold uppercase tracking-[.16em] text-slate-400" title={slot.player}>{slot.player}</p>
        <h3 className="mt-1 truncate font-display text-xl font-bold text-gold-light" title={slot.champion.name}>{slot.champion.name}</h3>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[.07] pt-3 text-[.68rem] text-slate-500">
          <select value={slot.role} onChange={(event) => onRoleChange(event.target.value as Role)} className="min-w-0 rounded border border-cyan/25 bg-[#07101e] px-1.5 py-1 text-[.62rem] font-bold text-cyan focus:border-cyan" aria-label={`Změnit linku pro ${slot.player}`} title="Změnit linku pouze tomuto hráči">
            {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role].short}</option>)}
          </select>
          <span className="truncate text-right">{slot.champion.pickRate.toFixed(1)} % · {integer.format(slot.champion.games)} her</span>
        </div>
      </div>
    </article>
  )
}

function ConfirmDialog({ draft, onCancel, onConfirm }: { draft: Draft; onCancel: () => void; onConfirm: () => void }) {
  const canSync = draft.slots.every((slot) => slot.riotId.includes('#'))
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#02050a]/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="glass max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border-gold/30 p-5 shadow-gold md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div><p className="eyebrow">Poslední kontrola</p><h2 id="confirm-title" className="mt-2 font-display text-2xl font-bold text-gold-light">Opravdu jdete do hry?</h2><p className="mt-2 text-sm leading-6 text-slate-400">Sestava se uloží hned. Po dohrání aplikace dohledá společný zápas a doplní skutečné výsledky.</p></div>
          <button type="button" className="btn-ghost !min-h-9 !px-2" onClick={onCancel} aria-label="Zavřít"><X size={18} /></button>
        </div>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {orderedByRole(draft.slots).map((slot) => <div key={slot.playerId} className="flex min-w-0 items-center gap-3 rounded-lg border border-white/[.08] bg-white/[.035] p-2.5"><ChampionImage champion={slot.champion} className="size-11 shrink-0 rounded-md object-cover" /><div className="min-w-0"><p className="truncate text-sm font-bold text-white">{slot.player}</p><p className="truncate text-xs text-slate-400">{ROLE_LABELS[slot.role].short} · {slot.champion.name}</p></div></div>)}
        </div>
        {!canSync && <p className="mt-4 rounded-md border border-amber-400/20 bg-amber-400/[.07] p-3 text-xs leading-5 text-amber-100/80">Někomu chybí Riot ID. Plán hry se uloží, ale automatický výsledek půjde načíst až po jeho doplnění v rosteru.</p>}
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" className="btn-ghost" onClick={onCancel}>Ještě ne</button><button type="button" className="btn-gold" onClick={onConfirm}><Check size={18} /> Potvrdit start hry</button></div>
      </div>
    </div>
  )
}

function StatisticsPanel({ history }: { history: ConfirmedGame[] }) {
  const stats = useMemo(() => calculatePlayerStats(history), [history])
  const syncedGames = history.filter((game) => game.match)
  const performances = syncedGames.reduce((total, game) => total + (game.match?.participants.length ?? 0), 0)
  if (!syncedGames.length) return (
    <Panel className="p-6 text-center"><BarChart3 className="mx-auto text-slate-700" size={30} /><h2 className="mt-3 font-display text-lg font-bold text-slate-400">Statistiky čekají na první výsledek</h2><p className="mt-2 text-sm text-slate-600">Po synchronizaci hry se tu objeví winrate, KDA, damage, vision i oblíbení šampioni.</p></Panel>
  )
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-white/[.08] p-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Skutečné výsledky</p><h2 className="section-title mt-1 flex items-center gap-2"><BarChart3 size={20} className="text-gold" /> Statistiky</h2></div><p className="text-sm text-slate-400">{syncedGames.length} zápasů · {performances} výkonů hráčů</p></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="border-b border-white/[.07] bg-black/10 text-[.62rem] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Hráč</th><th className="px-3 py-3">Hry</th><th className="px-3 py-3">W/L</th><th className="px-3 py-3">Winrate</th><th className="px-3 py-3">K / D / A</th><th className="px-3 py-3">KDA</th><th className="px-3 py-3">DMG Ø</th><th className="px-3 py-3">Vision Ø</th><th className="px-5 py-3">Nejhranější</th></tr></thead>
          <tbody className="divide-y divide-white/[.06]">
            {stats.map((row) => <tr key={row.playerId} className="hover:bg-white/[.025]"><td className="px-5 py-3 font-bold text-white">{row.displayName}</td><td className="px-3 py-3 text-slate-300">{row.games}</td><td className="px-3 py-3 text-slate-300">{row.wins}/{row.losses}</td><td className="px-3 py-3 text-cyan">{oneDecimal.format((row.wins / row.games) * 100)} %</td><td className="px-3 py-3 text-slate-300">{oneDecimal.format(row.kills / row.games)} / {oneDecimal.format(row.deaths / row.games)} / {oneDecimal.format(row.assists / row.games)}</td><td className="px-3 py-3 text-gold-light">{oneDecimal.format((row.kills + row.assists) / Math.max(1, row.deaths))}</td><td className="px-3 py-3 text-slate-300">{integer.format(Math.round(row.damage / row.games))}</td><td className="px-3 py-3 text-slate-300">{oneDecimal.format(row.vision / row.games)}</td><td className="px-5 py-3 text-slate-300">{row.favoriteChampion}</td></tr>)}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function SyncBadge({ game }: { game: ConfirmedGame }) {
  const styles = game.sync.status === 'synced' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : game.sync.status === 'error' ? 'border-red-400/25 bg-red-400/10 text-red-300' : game.sync.status === 'pending' ? 'border-cyan/25 bg-cyan/10 text-cyan' : 'border-white/10 bg-white/[.04] text-slate-500'
  const label = game.sync.status === 'synced' ? 'Výsledek načten' : game.sync.status === 'error' ? 'Chyba synchronizace' : game.sync.status === 'pending' ? 'Čeká na výsledek' : 'Bez Riot dat'
  return <span className={`rounded-full border px-2.5 py-1 text-[.62rem] font-bold ${styles}`}>{label}</span>
}

function HistoryPanel({ history, syncingIds, hasApiKey, importingRecent, onSync, onImportRecent, onUndo, onClear, onExport, onImport }: {
  history: ConfirmedGame[]
  syncingIds: Set<string>
  hasApiKey: boolean
  importingRecent: boolean
  onSync: (game: ConfirmedGame) => void
  onImportRecent: () => void
  onUndo: () => void
  onClear: () => void
  onExport: () => void
  onImport: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  const importRef = useRef<HTMLInputElement>(null)
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-white/[.08] p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="eyebrow">Sestavy a Riot výsledky</p><h2 className="section-title mt-1 flex items-center gap-2"><HistoryIcon size={20} className="text-gold" /> Historie</h2></div><span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1 text-xs font-semibold text-slate-300">{history.length} {history.length === 1 ? 'hra' : history.length >= 2 && history.length <= 4 ? 'hry' : 'her'}</span></div>
      <div className="flex flex-wrap gap-2 border-b border-white/[.08] px-5 py-3"><button type="button" className="btn-blue !min-h-9 !px-3 !text-xs" onClick={onImportRecent} disabled={importingRecent} title={hasApiKey ? 'Načíst posledních 10 Riot zápasů každého hráče s vyplněným Riot ID' : 'Nejdřív ulož Riot API klíč v nastavení'}>{importingRecent ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />} {importingRecent ? 'Načítám historii…' : 'Posledních 10 / hráč'}</button><button type="button" className="btn-ghost !min-h-9 !px-3 !text-xs" onClick={onUndo} disabled={!history.length}><Undo2 size={14} /> Vrátit poslední</button><button type="button" className="btn-ghost !min-h-9 !px-3 !text-xs" onClick={onExport} disabled={!history.length}><Download size={14} /> Export</button><button type="button" className="btn-ghost !min-h-9 !px-3 !text-xs" onClick={() => importRef.current?.click()}><Upload size={14} /> Import</button><button type="button" className="btn-ghost !min-h-9 !px-3 !text-xs hover:!border-red-400/40 hover:!text-red-300" onClick={onClear} disabled={!history.length}><Trash2 size={14} /> Vymazat</button><input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={onImport} /></div>
      {!history.length ? <div className="grid min-h-44 place-items-center p-8 text-center"><div><HistoryIcon className="mx-auto text-slate-700" size={30} /><p className="mt-3 text-sm text-slate-500">První potvrzená hra se objeví tady.</p></div></div> : (
        <div className="max-h-[52rem] divide-y divide-white/[.07] overflow-y-auto">
          {[...history].reverse().map((game) => {
            const syncing = syncingIds.has(game.id)
            const duration = game.match ? Math.round(game.match.durationSeconds / 60) : null
            return (
              <details key={game.id} className="group px-5 py-4 open:bg-white/[.02]" open={game === history.at(-1)}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-display text-sm font-bold text-gold-light">Hra #{game.number}</p><SyncBadge game={game} />{game.origin === 'riot-import' && <span className="rounded-full border border-violet-400/25 bg-violet-400/10 px-2.5 py-1 text-[.62rem] font-bold text-violet-200">RIOT IMPORT</span>}</div><p className="mt-1 text-xs text-slate-500">{dateTime.format(new Date(game.confirmedAt))} · patch {game.patch}{game.match ? ` · ${game.match.gameMode} · ${duration} min` : ''}</p></div><ChevronDown size={17} className="shrink-0 text-slate-500 transition group-open:rotate-180" /></summary>
                {game.sync.status !== 'synced' && <div className="mt-4 flex flex-col gap-3 rounded-lg border border-white/[.07] bg-black/10 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-400">{game.sync.message ?? 'Výsledek zatím není načten.'}</p><button type="button" className="btn-blue shrink-0 !min-h-9 !px-3 !text-xs" onClick={() => onSync(game)} disabled={syncing || !hasApiKey}>{syncing ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCcw size={14} />} Načíst výsledek</button></div>}
                <div className="mt-4 grid gap-2">
                  {orderedByRole(game.slots).map((slot) => {
                    const actual = game.match?.participants.find((participant) => participant.playerId === slot.playerId)
                    return <div key={`${game.id}-${slot.playerId}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3"><ChampionImage champion={slot.champion} className="size-9 rounded object-cover" /><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-200">{slot.player}</p><p className="truncate text-[.68rem] text-slate-500">{game.origin === 'riot-import' ? `Hrál: ${actual?.championName ?? slot.champion.name}` : `Plán: ${slot.champion.name}${actual ? ` · Hrál: ${actual.championName}` : ''}`}</p></div>{actual ? <span className={`text-right text-[.68rem] font-bold ${actual.win ? 'text-emerald-300' : 'text-red-300'}`}>{actual.win ? 'VÝHRA' : 'PROHRA'}<small className="block font-normal text-slate-400">{actual.kills}/{actual.deaths}/{actual.assists}</small></span> : <span className="text-[.62rem] font-bold tracking-wider text-cyan/80">{slot.role}</span>}</div>
                  })}
                </div>
                {game.match && <p className="mt-4 break-all border-t border-white/[.06] pt-3 text-[.62rem] text-slate-600">Riot match: {game.match.matchId} · načteno {dateTime.format(new Date(game.match.fetchedAt))}</p>}
              </details>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState())
  const stateRef = useRef(state)
  const [bundledDataset, setBundledDataset] = useState<MetaDataset | null>(null)
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [newPlayerName, setNewPlayerName] = useState('')
  const [newPlayerRiotId, setNewPlayerRiotId] = useState('')
  const [editingPlayer, setEditingPlayer] = useState<Pick<Player, 'id' | 'name' | 'riotId'> | null>(null)
  const [riotStatus, setRiotStatus] = useState<RiotApiStatus>({ hasApiKey: false, protectedStorage: false })
  const [apiKey, setApiKey] = useState('')
  const [savingApiKey, setSavingApiKey] = useState(false)
  const [importingRecent, setImportingRecent] = useState(false)
  const [syncingIds, setSyncingIds] = useState<Set<string>>(() => new Set())
  const [rosterFile, setRosterFile] = useState<RosterFileResult | null>(null)
  const [rosterReady, setRosterReady] = useState(() => !window.desktop?.roster)
  const rosterSnapshot = useRef<string | null>(null)
  const datasetInput = useRef<HTMLInputElement>(null)
  const dataset = state.customDataset ?? bundledDataset

  useEffect(() => {
    let active = true
    loadBundledDataset().then((data) => { if (active) setBundledDataset(data) }).catch((error: unknown) => { if (active) setLoadingError(error instanceof Error ? error.message : 'Dataset se nepodařilo načíst.') })
    window.desktop?.riot.getStatus().then((status) => { if (active) setRiotStatus(status) }).catch(() => undefined)
    const rosterBridge = window.desktop?.roster
    if (rosterBridge) rosterBridge.load().then(async (loaded) => {
      if (!active) return
      const localPlayers = stateRef.current.players
      if (!loaded.players.length && localPlayers.length) {
        const saved = await rosterBridge.save(localPlayers)
        if (!active) return
        rosterSnapshot.current = JSON.stringify(saved.players)
        setRosterFile(saved)
      } else {
        rosterSnapshot.current = JSON.stringify(loaded.players)
        setRosterFile(loaded)
        setState((current) => {
          const fileIds = new Set(loaded.players.map((player) => player.id))
          const retainedSelection = current.selectedPlayerIds.filter((id) => fileIds.has(id))
          return { ...current, players: loaded.players, selectedPlayerIds: retainedSelection.length ? retainedSelection : loaded.players.slice(0, 5).map((player) => player.id) }
        })
      }
      setRosterReady(true)
    }).catch((error: unknown) => {
      if (!active) return
      setRosterReady(true)
      setMessage({ type: 'error', text: error instanceof Error ? `Soubor hráčů se nepodařilo načíst: ${error.message}` : 'Soubor hráčů se nepodařilo načíst.' })
    })
    return () => { active = false }
  }, [])

  useEffect(() => { stateRef.current = state; saveState(state) }, [state])

  useEffect(() => {
    const rosterBridge = window.desktop?.roster
    if (!rosterReady || !rosterBridge) return
    const serialized = JSON.stringify(state.players)
    if (serialized === rosterSnapshot.current) return
    const valid = state.players.every((player) => player.id && player.name.trim() && player.name.length <= 40 && player.riotId.length <= 81 && (!player.riotId || player.riotId.includes('#')))
      && new Set(state.players.map((player) => player.name.trim().toLocaleLowerCase('cs'))).size === state.players.length
    if (!valid) return
    const timer = window.setTimeout(() => {
      rosterBridge.save(state.players).then((saved) => {
        rosterSnapshot.current = JSON.stringify(saved.players)
        setRosterFile(saved)
      }).catch((error: unknown) => setMessage({ type: 'error', text: error instanceof Error ? `Hráče se nepodařilo uložit do souboru: ${error.message}` : 'Hráče se nepodařilo uložit do souboru.' }))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [rosterReady, state.players])

  const selectedPlayers = useMemo(() => state.players.filter((player) => state.selectedPlayerIds.includes(player.id)), [state.players, state.selectedPlayerIds])
  const cooldown = useMemo(() => getCooldownEntries(state.history, state.settings.cooldownGames), [state.history, state.settings.cooldownGames])
  const pendingSignature = state.history.filter((game) => game.sync.status === 'pending').map((game) => game.id).join('|')

  const patchCounts = useMemo(() => {
    if (!dataset) return null
    return Object.fromEntries(['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'].map((role) => [role, dataset.entries.filter((entry) => entry.role === role && entry.pickRate >= state.settings.minPickRate && entry.games >= state.settings.minGames).length])) as Record<Role, number>
  }, [dataset, state.settings.minGames, state.settings.minPickRate])

  const syncGame = useCallback(async (game: ConfirmedGame, silent = false) => {
    const bridge = window.desktop?.riot
    if (!bridge) {
      if (!silent) setMessage({ type: 'error', text: 'Synchronizace Riot API funguje pouze v desktopové Electron aplikaci.' })
      return
    }
    const current = stateRef.current
    const players = game.slots.map((slot) => {
      const rosterPlayer = current.players.find((player) => player.id === slot.playerId)
      return { playerId: slot.playerId, displayName: slot.player, riotId: rosterPlayer?.riotId || slot.riotId }
    })
    if (players.some((player) => !player.riotId.includes('#'))) {
      setState((value) => ({ ...value, history: value.history.map((item) => item.id === game.id ? { ...item, sync: { ...item.sync, status: 'untracked', message: 'Doplň všem účastníkům Riot ID ve formátu Jméno#TAG.' } } : item) }))
      if (!silent) setMessage({ type: 'error', text: 'Nejdřív doplň všem účastníkům Riot ID ve formátu Jméno#TAG.' })
      return
    }
    setSyncingIds((ids) => new Set(ids).add(game.id))
    try {
      const result = await bridge.syncGame({ gameId: game.id, confirmedAt: game.confirmedAt, players, excludedMatchIds: current.history.flatMap((item) => item.match ? [item.match.matchId] : []) })
      const attemptedAt = new Date().toISOString()
      setState((value) => ({ ...value, history: value.history.map((item) => item.id !== game.id ? item : result.kind === 'matched'
        ? { ...item, match: result.match, sync: { status: 'synced', lastAttemptAt: attemptedAt, message: null } }
        : { ...item, sync: { status: 'pending', lastAttemptAt: attemptedAt, message: result.message } }) }))
      if (result.kind === 'matched') setMessage({ type: 'success', text: `Výsledek hry #${game.number} byl načten a statistiky přepočítány.` })
      else if (!silent) setMessage({ type: 'success', text: result.message })
    } catch (error) {
      const text = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Synchronizace se nezdařila.'
      setState((value) => ({ ...value, history: value.history.map((item) => item.id === game.id ? { ...item, sync: { status: 'error', lastAttemptAt: new Date().toISOString(), message: text } } : item) }))
      if (!silent) setMessage({ type: 'error', text })
    } finally {
      setSyncingIds((ids) => { const next = new Set(ids); next.delete(game.id); return next })
    }
  }, [])

  const importRecentMatches = async () => {
    const bridge = window.desktop?.riot
    if (!bridge || !dataset) return setMessage({ type: 'error', text: 'Import Riot historie funguje pouze v desktopové aplikaci.' })
    if (!riotStatus.hasApiKey) return setMessage({ type: 'error', text: 'Nejdřív v nastavení ulož Riot API klíč.' })
    const rosterPlayers = stateRef.current.players.filter((player) => player.riotId.includes('#'))
    const skipped = stateRef.current.players.length - rosterPlayers.length
    if (!rosterPlayers.length) return setMessage({ type: 'error', text: 'Alespoň jeden hráč musí mít vyplněné Riot ID ve formátu Jméno#TAG.' })
    if (rosterPlayers.length > 10) return setMessage({ type: 'error', text: 'Najednou lze načíst historii nejvýše deseti hráčů.' })
    setImportingRecent(true)
    setMessage(null)
    try {
      const current = stateRef.current
      const result = await bridge.importRecentMatches({
        excludedMatchIds: current.history.flatMap((game) => game.match ? [game.match.matchId] : []),
        players: rosterPlayers.map((player) => ({ playerId: player.id, displayName: player.name, riotId: player.riotId })),
      })
      const merged = mergeRecentMatches(stateRef.current.history, result.matches, dataset)
      setState((value) => ({ ...value, history: merged.history }))
      const skippedText = skipped ? ` Bez Riot ID (přeskočeno): ${skipped}.` : ''
      setMessage({ type: 'success', text: merged.added ? `Načteno ${merged.added} nových unikátních zápasů pro ${result.playerCount} hráčů.${skippedText}` : `Poslední zápasy už jsou v historii.${skippedText}` })
    } catch (error) {
      const text = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Import posledních zápasů se nezdařil.'
      setMessage({ type: 'error', text })
    } finally {
      setImportingRecent(false)
    }
  }

  useEffect(() => {
    if (!riotStatus.hasApiKey || !pendingSignature) return
    const runPending = () => {
      for (const game of stateRef.current.history.filter((item) => item.sync.status === 'pending')) void syncGame(game, true)
    }
    const initial = window.setTimeout(runPending, 4_000)
    const interval = window.setInterval(runPending, 3 * 60_000)
    return () => { window.clearTimeout(initial); window.clearInterval(interval) }
  }, [pendingSignature, riotStatus.hasApiKey, syncGame])

  const updateSettings = (patch: Partial<Settings>) => setState((current) => ({ ...current, settings: { ...current.settings, ...patch } }))

  const run = (operation: () => Draft) => {
    try { const draft = operation(); setState((current) => ({ ...current, draft })); setMessage(null) }
    catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Losování se nepodařilo.' }) }
  }

  const generate = (mode: 'all' | 'champions') => {
    if (!dataset) return
    const playerError = validatePlayers(selectedPlayers)
    if (playerError) return setMessage({ type: 'error', text: playerError })
    const sameLineup = state.draft && state.draft.slots.length === selectedPlayers.length && state.draft.slots.every((slot, index) => slot.playerId === selectedPlayers[index].id)
    const fixedRoles = mode === 'champions' && sameLineup && state.draft ? state.draft.slots.map((slot) => slot.role) : undefined
    run(() => generateDraft(selectedPlayers, dataset, state.settings, state.history, Math.random, fixedRoles))
  }

  const rerollOne = (index: number) => { if (dataset && state.draft) run(() => rerollOneChampion(state.draft!, index, dataset, state.settings, state.history)) }
  const changeRole = (index: number, role: Role) => { if (dataset && state.draft) run(() => changePlayerRole(state.draft!, index, role, dataset, state.settings, state.history)) }

  const confirm = () => {
    if (!state.draft) return
    setState((current) => current.draft ? { ...current, history: confirmDraft(current.draft, current.history), draft: null } : current)
    setConfirming(false)
    setMessage({ type: 'success', text: 'Hra je uložená. Po dohrání se výsledek načte automaticky.' })
  }

  const addPlayer = () => {
    const name = newPlayerName.trim()
    const riotId = newPlayerRiotId.trim()
    if (!name) return setMessage({ type: 'error', text: 'Nový hráč musí mít jméno.' })
    if (state.players.some((player) => player.name.toLocaleLowerCase('cs') === name.toLocaleLowerCase('cs'))) return setMessage({ type: 'error', text: 'Hráč s tímto jménem už v rosteru je.' })
    if (riotId && !riotId.includes('#')) return setMessage({ type: 'error', text: 'Riot ID musí mít formát Jméno#TAG.' })
    const player: Player = { id: createId(), name, riotId }
    setState((current) => ({ ...current, players: [...current.players, player], selectedPlayerIds: current.selectedPlayerIds.length < 5 ? [...current.selectedPlayerIds, player.id] : current.selectedPlayerIds }))
    setNewPlayerName(''); setNewPlayerRiotId(''); setMessage({ type: 'success', text: `${name} byl uložen do rosteru.` })
  }

  const updatePlayer = (id: string, patch: Partial<Pick<Player, 'name' | 'riotId'>>) => setState((current) => ({ ...current, players: current.players.map((player) => player.id === id ? { ...player, ...patch } : player) }))

  const saveEditedPlayer = () => {
    if (!editingPlayer) return
    const name = editingPlayer.name.trim()
    const riotId = editingPlayer.riotId.trim()
    if (!name) return setMessage({ type: 'error', text: 'Hráč musí mít jméno.' })
    if (state.players.some((player) => player.id !== editingPlayer.id && player.name.toLocaleLowerCase('cs') === name.toLocaleLowerCase('cs'))) return setMessage({ type: 'error', text: 'Hráč s tímto jménem už v rosteru je.' })
    if (riotId && !riotId.includes('#')) return setMessage({ type: 'error', text: 'Riot ID musí mít formát Jméno#TAG.' })
    updatePlayer(editingPlayer.id, { name, riotId })
    setEditingPlayer(null)
    setMessage({ type: 'success', text: `${name} byl upraven.` })
  }

  const togglePlayer = (id: string) => {
    setState((current) => {
      if (current.selectedPlayerIds.includes(id)) return { ...current, selectedPlayerIds: current.selectedPlayerIds.filter((playerId) => playerId !== id) }
      if (current.selectedPlayerIds.length >= 5) { setMessage({ type: 'error', text: 'Pro jednu sestavu můžeš zaškrtnout nejvýše pět hráčů.' }); return current }
      return { ...current, selectedPlayerIds: [...current.selectedPlayerIds, id] }
    })
  }

  const removePlayer = (player: Player) => {
    if (!window.confirm(`Odebrat hráče ${player.name} z rosteru? Stará historie zůstane zachovaná.`)) return
    setState((current) => ({ ...current, players: current.players.filter((item) => item.id !== player.id), selectedPlayerIds: current.selectedPlayerIds.filter((id) => id !== player.id) }))
    if (editingPlayer?.id === player.id) setEditingPlayer(null)
  }

  const saveApiKey = async () => {
    if (!window.desktop?.riot) return setMessage({ type: 'error', text: 'API klíč lze uložit jen v desktopové aplikaci.' })
    setSavingApiKey(true)
    try {
      const status = await window.desktop.riot.setApiKey(apiKey)
      setRiotStatus(status); setApiKey('')
      setState((current) => ({ ...current, history: current.history.map((game) => game.sync.status === 'error' && !game.match ? { ...game, sync: { ...game.sync, status: 'pending' } } : game) }))
      setMessage({ type: 'success', text: 'Riot API klíč byl uložen pouze v lokálním profilu aplikace.' })
    } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'API klíč se nepodařilo uložit.' }) }
    finally { setSavingApiKey(false) }
  }

  const removeApiKey = async () => {
    if (!window.desktop?.riot) return
    setSavingApiKey(true)
    try { setRiotStatus(await window.desktop.riot.setApiKey('')); setApiKey(''); setMessage({ type: 'success', text: 'Riot API klíč byl z počítače odstraněn.' }) }
    finally { setSavingApiKey(false) }
  }

  const importDataset = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
    try { const imported = validateMetaDataset(JSON.parse(await file.text())); setState((current) => ({ ...current, customDataset: imported, settings: { ...current.settings, minPickRate: imported.defaults.minPickRate, minGames: imported.defaults.minGames } })); setMessage({ type: 'success', text: `Dataset pro patch ${imported.patch} byl ověřen a aktivován.` }) }
    catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Import datasetu selhal.' }) }
  }

  const importHistory = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
    try { const history = validateHistoryBackup(JSON.parse(await file.text())); if (!window.confirm(`Nahradit aktuální historii (${state.history.length} her) zálohou (${history.length} her)?`)) return; setState((current) => ({ ...current, history, draft: null })); setMessage({ type: 'success', text: 'Historie byla importována, statistiky a cooldown přepočítány.' }) }
    catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Import historie selhal.' }) }
  }

  const undo = () => { const last = state.history.at(-1); if (!last || !window.confirm(`Vrátit hru #${last.number}? Cooldown i statistiky se přepočítají.`)) return; setState((current) => ({ ...current, history: current.history.slice(0, -1) })) }
  const clear = () => { if (!window.confirm('Opravdu vymazat celou historii? Tuto akci nelze vrátit.')) return; setState((current) => ({ ...current, history: [] })); setMessage({ type: 'success', text: 'Historie byla vymazána.' }) }
  const resetApp = () => { if (!window.confirm('Obnovit celou aplikaci do výchozího stavu včetně rosteru a historie? Riot API klíč se nemaže.')) return; setState(DEFAULT_STATE) }

  if (loadingError && !dataset) return <main className="grid min-h-screen place-items-center p-6"><Panel className="max-w-lg p-8 text-center"><AlertTriangle className="mx-auto text-red-300" /><h1 className="mt-4 font-display text-2xl text-gold-light">Data se nenačetla</h1><p className="mt-3 text-sm text-slate-400">{loadingError}</p></Panel></main>

  const rosterPanel = (
    <Panel>
      <div className="border-b border-white/[.08] p-5">
        <div className="flex items-start justify-between gap-3">
          <div><p className="eyebrow">Stálý roster</p><h2 className="section-title mt-1">Hráči</h2></div>
          <details className="group relative">
            <summary className="btn-ghost cursor-pointer list-none !min-h-9 !px-3"><Settings2 size={15} /><span className="sr-only">Nastavení</span><ChevronDown size={14} className="transition group-open:rotate-180" /></summary>
            <div className="absolute right-0 z-30 mt-3 grid w-[min(30rem,calc(100vw-3rem))] gap-4 rounded-lg border border-white/10 bg-[#07101d] p-4 shadow-2xl xl:left-0 xl:right-auto xl:w-[30rem]">
              <label className="grid grid-cols-[1fr_7rem] items-center gap-4 text-sm text-slate-300"><span>Cooldown potvrzených her <small className="block text-slate-600">0–10 her</small></span><input className="field text-center" type="number" min="0" max="10" value={state.settings.cooldownGames} onChange={(event) => updateSettings({ cooldownGames: Math.max(0, Math.min(10, Number(event.target.value))) })} /></label>
              <label className="grid grid-cols-[1fr_7rem] items-center gap-4 text-sm text-slate-300"><span>Minimální pick rate <small className="block text-slate-600">v procentech</small></span><input className="field text-center" type="number" min="0" max="100" step="0.1" value={state.settings.minPickRate} onChange={(event) => updateSettings({ minPickRate: Math.max(0, Number(event.target.value)) })} /></label>
              <label className="grid grid-cols-[1fr_7rem] items-center gap-4 text-sm text-slate-300"><span>Minimální počet her</span><input className="field text-center" type="number" min="0" step="100" value={state.settings.minGames} onChange={(event) => updateSettings({ minGames: Math.max(0, Number(event.target.value)) })} /></label>
              <div className="border-t border-white/[.08] pt-4"><div className="flex items-center gap-2 text-sm font-bold text-white"><KeyRound size={16} className="text-gold" /> Riot API pro výsledky</div><p className="mt-2 text-xs leading-5 text-slate-500">Klíč se neposílá do GitHubu ani exportu. Vývojový klíč z Riot portálu expiruje po 24 hodinách.</p><input type="password" className="field mt-3" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={riotStatus.hasApiKey ? 'Klíč je uložený — vložením ho nahradíš' : 'RGAPI-…'} autoComplete="off" /><div className="mt-2 flex flex-wrap gap-2"><button type="button" className="btn-blue !min-h-9 !text-xs" onClick={() => void saveApiKey()} disabled={savingApiKey || !apiKey.trim()}>{savingApiKey ? <LoaderCircle size={14} className="animate-spin" /> : <KeyRound size={14} />} Uložit klíč</button>{riotStatus.hasApiKey && <button type="button" className="btn-ghost !min-h-9 !text-xs" onClick={() => void removeApiKey()} disabled={savingApiKey}>Odstranit klíč</button>}<a className="btn-ghost !min-h-9 !text-xs" href="https://developer.riotgames.com/" target="_blank" rel="noreferrer"><Link2 size={14} /> Riot Portal</a></div><p className={`mt-2 text-[.65rem] ${riotStatus.hasApiKey ? 'text-emerald-300/80' : 'text-slate-600'}`}>{riotStatus.hasApiKey ? `Klíč uložen${riotStatus.protectedStorage ? ' a chráněn systémovým úložištěm' : ' lokálně s omezenými právy souboru'}.` : 'Klíč zatím není nastaven.'}</p></div>
              <button type="button" className="btn-ghost !text-xs hover:!border-red-400/30 hover:!text-red-300" onClick={resetApp}><Trash2 size={14} /> Obnovit celou aplikaci</button>
            </div>
          </details>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">Zaškrtni 1–5 lidí pro dnešní sestavu.</p>
        <p className="mt-2 text-[.65rem] text-emerald-300/75">{rosterFile ? rosterFile.gitTrackable ? <>Git: <code className="text-emerald-200">data/players.json</code></> : 'Lokální profil aplikace' : 'Připojuji soubor hráčů…'}</p>
      </div>

      <div className="grid max-h-[34rem] gap-2 overflow-y-auto p-4">
        {state.players.map((player) => {
          const selected = state.selectedPlayerIds.includes(player.id)
          const editing = editingPlayer?.id === player.id ? editingPlayer : null
          return <div key={player.id} className={`rounded-lg border p-2.5 transition ${selected ? 'border-cyan/35 bg-cyan/[.06]' : 'border-white/[.07] bg-white/[.02]'}`}>{editing ? <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); saveEditedPlayer() }}><div className="flex items-center gap-2"><input type="checkbox" className="size-5 shrink-0 accent-[#0ac8b9]" checked={selected} onChange={() => togglePlayer(player.id)} aria-label={`${player.name} hraje`} /><input className="field !h-9 min-w-0 !px-2.5" value={editing.name} maxLength={40} onChange={(event) => setEditingPlayer({ ...editing, name: event.target.value })} aria-label="Jméno hráče" autoFocus /></div><input className="field !h-9 !px-2.5 text-xs" value={editing.riotId} maxLength={81} onChange={(event) => setEditingPlayer({ ...editing, riotId: event.target.value })} placeholder="Riot ID: Jméno#TAG (volitelné)" aria-label={`Riot ID hráče ${player.name}`} /><div className="flex justify-end gap-2"><button type="button" className="btn-ghost !min-h-8 !px-2.5 !text-xs" onClick={() => setEditingPlayer(null)}>Zrušit</button><button type="submit" className="btn-blue !min-h-8 !px-2.5 !text-xs"><Check size={13} /> Uložit</button></div></form> : <div className="flex items-center gap-2"><input type="checkbox" className="size-5 shrink-0 accent-[#0ac8b9]" checked={selected} onChange={() => togglePlayer(player.id)} aria-label={`${player.name} hraje`} /><span className="min-w-0 flex-1 truncate px-1 text-sm font-semibold text-slate-200" title={player.name}>{player.name}</span><details className="group relative"><summary className="btn-ghost cursor-pointer list-none !min-h-9 !px-2.5" aria-label={`Možnosti hráče ${player.name}`}><EllipsisVertical size={16} /></summary><div className="absolute right-0 z-20 mt-2 grid w-36 gap-1 rounded-lg border border-white/10 bg-[#07101d] p-1.5 shadow-2xl"><button type="button" className="flex items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-slate-300 transition hover:bg-white/[.07] hover:text-white" onClick={() => setEditingPlayer({ id: player.id, name: player.name, riotId: player.riotId })}><Pencil size={14} /> Upravit</button><button type="button" className="flex items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-red-300 transition hover:bg-red-400/10" onClick={() => removePlayer(player)}><Trash2 size={14} /> Smazat</button></div></details></div>}</div>
        })}
        {!state.players.length && <div className="rounded-lg border border-dashed border-white/10 p-5 text-center text-sm text-slate-600">Přidej prvního hráče.</div>}
      </div>

      <div className="border-t border-white/[.08] bg-black/10 p-4">
        <div className="grid gap-2"><input className="field !h-10" value={newPlayerName} onChange={(event) => setNewPlayerName(event.target.value)} placeholder="Jméno hráče" maxLength={40} onKeyDown={(event) => { if (event.key === 'Enter') addPlayer() }} /><input className="field !h-10" value={newPlayerRiotId} onChange={(event) => setNewPlayerRiotId(event.target.value)} placeholder="Riot ID / tag (volitelné)" maxLength={81} onKeyDown={(event) => { if (event.key === 'Enter') addPlayer() }} /><button type="button" className="btn-blue !min-h-10" onClick={addPlayer}><Plus size={16} /> Přidat hráče</button></div>
        <button type="button" className="btn-gold mt-3 w-full" disabled={!dataset} onClick={() => generate('all')}><Shuffle size={18} /> Vygenerovat sestavu</button>
        <p className="mt-3 text-center text-xs text-slate-500"><strong className="text-cyan">{selectedPlayers.length}</strong> z {state.players.length} vybráno</p>
      </div>
    </Panel>
  )

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[.07] bg-[#040913]/75 backdrop-blur-xl"><div className="mx-auto flex max-w-[1900px] flex-col gap-5 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8"><div className="flex items-center gap-4"><div className="grid size-12 shrink-0 rotate-45 place-items-center border border-gold/60 bg-gold/10 shadow-gold"><Dice5 className="-rotate-45 text-gold" size={24} /></div><div><p className="eyebrow">Summoner's Rift · uložený roster</p><h1 className="font-display text-2xl font-extrabold tracking-wide text-gold-light sm:text-3xl">LoL Randomizer</h1></div></div>{dataset ? <div className="flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full border px-3 py-1.5 font-bold ${isDatasetStale(dataset) ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'}`}>{isDatasetStale(dataset) ? 'Snapshot je zastaralý' : 'Snapshot je aktuální'}</span><span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-slate-300">Patch {dataset.patch}</span></div> : <span className="text-sm text-slate-500">Načítám role data…</span>}</div></header>

      <main className="mx-auto max-w-[1900px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        {message && <div className={`mb-6 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${message.type === 'error' ? 'border-red-400/25 bg-red-500/10 text-red-200' : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'}`} role="status"><span className="flex items-center gap-2">{message.type === 'error' ? <AlertTriangle size={17} /> : <Check size={17} />}{message.text}</span><button type="button" onClick={() => setMessage(null)} aria-label="Zavřít zprávu"><X size={16} /></button></div>}

        <div className="grid items-start gap-6 xl:grid-cols-[280px_minmax(0,1fr)_300px] 2xl:grid-cols-[310px_minmax(0,1fr)_340px]">
          <aside className="xl:sticky xl:top-6">{rosterPanel}</aside>
          <div className="space-y-6">

            {state.draft ? <Panel className="overflow-hidden border-gold/20"><div className="flex flex-col gap-3 border-b border-white/[.08] px-5 py-5 sm:flex-row sm:items-end sm:justify-between md:px-7"><div><p className="eyebrow">Nepotvrzený návrh</p><h2 className="section-title mt-1">Tvoje sestava</h2></div><p className="text-xs text-slate-500">Reroll ani individuální změna linky nemění historii a cooldown</p></div><div className="grid grid-cols-5 gap-2 p-3 md:gap-3 md:p-5">{orderedByRole(state.draft.slots.map((slot, originalIndex) => ({ slot, originalIndex, role: slot.role }))).map(({ slot, originalIndex }, displayIndex) => <DraftCard key={`${state.draft!.id}-${slot.playerId}`} slot={slot} index={displayIndex} onReroll={() => rerollOne(originalIndex)} onRoleChange={(role) => changeRole(originalIndex, role)} />)}</div><div className="grid gap-3 border-t border-white/[.08] bg-black/10 p-4 sm:grid-cols-3 md:p-6"><button type="button" className="btn-ghost" onClick={() => generate('all')}><Shuffle size={17} /> Role i šampioni</button><button type="button" className="btn-blue" onClick={() => generate('champions')}><RefreshCcw size={17} /> Jen šampioni</button><button type="button" className="btn-gold !min-h-14" onClick={() => setConfirming(true)}><Swords size={20} /> 🎮 Jdeme do hry!</button></div></Panel> : <div className="grid min-h-[22rem] place-items-center rounded-xl border border-dashed border-white/10 bg-white/[.015] p-8 text-center"><div><Dice5 className="mx-auto text-slate-700" size={42} /><h2 className="mt-4 font-display text-xl font-bold text-slate-400">Zatím žádný návrh</h2><p className="mt-2 text-sm text-slate-600">Zaškrtni 1–5 uložených hráčů a nech náhodu rozhodnout.</p></div></div>}

            <StatisticsPanel history={state.history} />
            <HistoryPanel history={state.history} syncingIds={syncingIds} hasApiKey={riotStatus.hasApiKey} importingRecent={importingRecent} onSync={(game) => void syncGame(game)} onImportRecent={() => void importRecentMatches()} onUndo={undo} onClear={clear} onExport={() => downloadJson(`lol-randomizer-history-${new Date().toISOString().slice(0, 10)}.json`, createHistoryBackup(state.history))} onImport={importHistory} />
          </div>

          <aside className="space-y-6 xl:sticky xl:top-6">
            <Panel className="overflow-hidden"><div className="border-b border-white/[.08] p-5"><p className="eyebrow">Globální zákaz</p><h2 className="section-title mt-1 flex items-center gap-2"><LockKeyhole size={19} className="text-gold" /> Cooldown</h2></div>{!cooldown.length ? <div className="p-6 text-center"><Shield className="mx-auto text-emerald-400/40" size={28} /><p className="mt-3 text-sm text-slate-500">Žádný šampion není blokovaný.</p></div> : <div className="grid max-h-[25rem] grid-cols-2 gap-2 overflow-y-auto p-4">{cooldown.map((entry) => <div key={entry.champion.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-white/[.07] bg-white/[.025] p-2"><ChampionImage champion={entry.champion} className="size-9 shrink-0 rounded object-cover grayscale-[.4]" /><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-300">{entry.champion.name}</p><p className="text-[.65rem] text-amber-300/80">ještě {entry.remainingGames} {entry.remainingGames === 1 ? 'hra' : entry.remainingGames <= 4 ? 'hry' : 'her'}</p></div></div>)}</div>}<div className="border-t border-white/[.07] bg-black/10 px-5 py-3 text-xs leading-5 text-slate-500">Počítá se z posledních {state.settings.cooldownGames} potvrzených her bez ohledu na stav Riot synchronizace.</div></Panel>

            {dataset && <Panel className="p-5"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Role data</p><h2 className="section-title mt-1 flex items-center gap-2"><Database size={19} className="text-gold" /> Meta snapshot</h2></div>{state.customDataset && <span className="rounded border border-cyan/20 bg-cyan/10 px-2 py-1 text-[.6rem] font-bold text-cyan">VLASTNÍ</span>}</div><dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs"><dt className="text-slate-500">Patch</dt><dd className="text-right font-semibold text-slate-200">{dataset.patch}</dd><dt className="text-slate-500">Aktualizace</dt><dd className="text-right text-slate-300">{dataset.updatedAt}</dd><dt className="text-slate-500">Zdroj</dt><dd className="truncate text-right"><a className="text-cyan hover:underline" href={dataset.source.url} target="_blank" rel="noreferrer">{dataset.source.name}</a></dd></dl>{patchCounts && <div className="mt-4 grid grid-cols-5 gap-1">{Object.entries(patchCounts).map(([role, count]) => <div key={role} className="rounded bg-white/[.035] px-1 py-2 text-center"><span className="block text-[.56rem] font-bold text-slate-500">{role}</span><span className="mt-1 block text-xs font-bold text-slate-200">{count}</span></div>)}</div>}<div className="mt-4 grid gap-2"><button type="button" className="btn-blue" onClick={() => datasetInput.current?.click()}><Upload size={16} /> Importovat dataset</button>{state.customDataset && <button type="button" className="btn-ghost" onClick={() => { setState((current) => ({ ...current, customDataset: null })); setMessage({ type: 'success', text: 'Obnoven výchozí dataset.' }) }}><RefreshCcw size={16} /> Použít výchozí</button>}<input ref={datasetInput} type="file" accept="application/json,.json" className="hidden" onChange={importDataset} /></div></Panel>}

            <Panel className="p-5"><p className="eyebrow">Stav skupiny</p><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-white/[.035] p-3"><Users className="mx-auto text-cyan/70" size={17} /><strong className="mt-2 block font-display text-lg text-white">{state.players.length}</strong><span className="text-[.62rem] text-slate-500">uloženo</span></div><div className="rounded-lg bg-white/[.035] p-3"><UserRoundCheck className="mx-auto text-emerald-300/70" size={17} /><strong className="mt-2 block font-display text-lg text-white">{selectedPlayers.length}</strong><span className="text-[.62rem] text-slate-500">hraje</span></div><div className="rounded-lg bg-white/[.035] p-3"><Swords className="mx-auto text-gold/80" size={17} /><strong className="mt-2 block font-display text-lg text-white">{state.history.length}</strong><span className="text-[.62rem] text-slate-500">her</span></div></div></Panel>
          </aside>
        </div>
        <footer className="mt-12 border-t border-white/[.07] py-8 text-xs leading-6 text-slate-600">LoL Randomizer není podporován společností Riot Games a neodráží názory Riot Games ani nikoho, kdo se oficiálně podílí na produkci nebo správě jejích her. Riot Games a všechny související vlastnosti jsou ochranné známky nebo registrované ochranné známky společnosti Riot Games, Inc.</footer>
      </main>
      {confirming && state.draft && <ConfirmDialog draft={state.draft} onCancel={() => setConfirming(false)} onConfirm={confirm} />}
    </div>
  )
}
