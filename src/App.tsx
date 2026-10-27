import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  ArrowLeft,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Coins,
  Crosshair,
  Database,
  Dice5,
  Download,
  EllipsisVertical,
  Eye,
  History as HistoryIcon,
  LoaderCircle,
  LockKeyhole,
  Moon,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCw,
  Settings2,
  Shield,
  Shuffle,
  Swords,
  Sun,
  Trophy,
  Trash2,
  Undo2,
  Upload,
  UserRoundCheck,
  Users,
  X,
} from 'lucide-react'
import { ROLES, type AppState, type ChampionRoleEntry, type ConfirmedGame, type Draft, type MetaDataset, type Player, type RecentMatchesRange, type Role, type Settings } from './types'
import { changePlayerRole, confirmDraft, generateDraft, getCooldownEntries, rerollOneChampion, validatePlayers } from './lib/randomizer'
import { isDatasetStale, loadBundledDataset, validateMetaDataset } from './lib/meta'
import { calculatePlayerStats, type PlayerAggregate } from './lib/stats'
import { mergeRecentMatches } from './lib/recentMatches'
import { buildPlayerDetail } from './lib/playerDetail'
import { buildGroupInsights } from './lib/groupInsights'
import { cachedMatchCoverage, matchesFromHistory } from './lib/statistics-file'
import { createHistoryBackup, DEFAULT_STATE, loadState, saveState, validateHistoryBackup } from './lib/storage'

const ROLE_LABELS: Record<Role, { short: string; title: string; mark: string }> = {
  TOP: { short: 'TOP', title: 'Horní lajna', mark: 'T' },
  JUNGLE: { short: 'JUNGLE', title: 'Džungle', mark: 'J' },
  MID: { short: 'MID', title: 'Středová lajna', mark: 'M' },
  ADC: { short: 'ADC', title: 'Spodní lajna', mark: 'A' },
  SUPPORT: { short: 'SUPPORT', title: 'Podpora', mark: 'S' },
}

const ROLE_TONES: Record<Role, { text: string; border: string; background: string; bar: string }> = {
  TOP: { text: 'text-amber-200', border: 'border-amber-400/20', background: 'bg-amber-400/[.07]', bar: 'bg-gradient-to-r from-amber-500/55 to-amber-300' },
  JUNGLE: { text: 'text-emerald-300', border: 'border-emerald-400/20', background: 'bg-emerald-400/[.07]', bar: 'bg-gradient-to-r from-emerald-500/55 to-emerald-300' },
  MID: { text: 'text-violet-300', border: 'border-violet-400/20', background: 'bg-violet-400/[.07]', bar: 'bg-gradient-to-r from-violet-500/55 to-violet-300' },
  ADC: { text: 'text-rose-300', border: 'border-rose-400/20', background: 'bg-rose-400/[.07]', bar: 'bg-gradient-to-r from-rose-500/55 to-rose-300' },
  SUPPORT: { text: 'text-sky-300', border: 'border-sky-400/20', background: 'bg-sky-400/[.07]', bar: 'bg-gradient-to-r from-sky-500/55 to-sky-300' },
}

function winRateTone(winRate: number): string {
  if (winRate >= 55) return 'border-emerald-400/25 bg-emerald-400/[.09] text-emerald-300'
  if (winRate >= 50) return 'border-cyan/25 bg-cyan/[.08] text-cyan'
  if (winRate >= 45) return 'border-amber-400/25 bg-amber-400/[.08] text-amber-200'
  return 'border-rose-400/25 bg-rose-400/[.08] text-rose-300'
}

const dateTime = new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' })
const integer = new Intl.NumberFormat('cs-CZ')
const oneDecimal = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
type AppTab = 'general' | 'statistics' | 'recent'
type StatisticsSortKey = 'displayName' | 'games' | 'wins' | 'winRate' | 'kills' | 'kda' | 'performance' | 'cs' | 'damage' | 'gold' | 'vision' | 'favoriteChampion'

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

function czechDateValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${day}/${month}/${date.getFullYear()}`
}

function czechDateToIso(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date > new Date()) return null
  return date.toISOString()
}

function RecentImportDialog({ importing, onCancel, onImport }: { importing: boolean; onCancel: () => void; onImport: (range: RecentMatchesRange) => Promise<boolean> }) {
  const [mode, setMode] = useState<RecentMatchesRange['mode']>('count')
  const [count, setCount] = useState(10)
  const [sinceDate, setSinceDate] = useState(() => { const date = new Date(); date.setDate(date.getDate() - 7); return czechDateValue(date) })
  const sinceIso = czechDateToIso(sinceDate)
  const countIsValid = Number.isSafeInteger(count) && count >= 1
  const submit = async () => {
    if ((mode === 'count' && !countIsValid) || (mode === 'since' && !sinceIso)) return
    const range: RecentMatchesRange = mode === 'count'
      ? { mode: 'count', count }
      : { mode: 'since', since: sinceIso! }
    if (await onImport(range)) onCancel()
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#02050a]/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="recent-import-title">
      <div className="glass w-full max-w-lg rounded-xl border-cyan/25 p-5 shadow-2xl md:p-7">
        <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Import OP.GG</p><h2 id="recent-import-title" className="mt-2 font-display text-2xl font-bold text-gold-light">Načíst hry</h2><p className="mt-2 text-sm leading-6 text-slate-400">Vyber počet posledních her, nebo datum, od kterého je chceš zahrnout.</p></div><button type="button" className="btn-ghost !min-h-9 !px-2" onClick={onCancel} disabled={importing} aria-label="Zavřít"><X size={18} /></button></div>
        <div className="mt-6 grid grid-cols-2 gap-2 rounded-lg border border-white/[.08] bg-black/10 p-1.5"><button type="button" onClick={() => setMode('count')} className={`min-h-11 rounded-md px-3 text-sm font-bold transition ${mode === 'count' ? 'bg-cyan/15 text-cyan' : 'text-slate-500 hover:bg-white/[.04] hover:text-slate-200'}`}><HistoryIcon className="mr-2 inline" size={16} />Počet her</button><button type="button" onClick={() => setMode('since')} className={`min-h-11 rounded-md px-3 text-sm font-bold transition ${mode === 'since' ? 'bg-cyan/15 text-cyan' : 'text-slate-500 hover:bg-white/[.04] hover:text-slate-200'}`}><CalendarDays className="mr-2 inline" size={16} />Od data</button></div>
        <div className="mt-5 rounded-lg border border-white/[.08] bg-white/[.02] p-4">{mode === 'count' ? <label className="block"><span className="text-sm font-semibold text-slate-300">Posledních her každého hráče</span><input type="number" min="1" step="1" className="field mt-2" value={count} onChange={(event) => setCount(Number(event.target.value))} autoFocus /><small className="mt-2 block text-xs text-slate-600">Zadej libovolné kladné celé číslo.</small></label> : <label className="block"><span className="text-sm font-semibold text-slate-300">Načíst hry ode dne</span><input type="text" inputMode="numeric" maxLength={10} placeholder="DD/MM/YYYY" className="field mt-2" value={sinceDate} onChange={(event) => setSinceDate(event.target.value)} aria-invalid={!sinceIso} autoComplete="off" autoFocus /><small className={`mt-2 block text-xs ${sinceIso ? 'text-slate-600' : 'text-red-300'}`}>{sinceIso ? 'Formát DD/MM/YYYY, počítáno od místní půlnoci.' : 'Zadej platné datum ve formátu DD/MM/YYYY.'}</small></label>}</div>
        <div className="mt-4 flex gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[.05] p-3 text-xs leading-5 text-amber-100/70"><AlertTriangle className="mt-0.5 shrink-0" size={15} /><span>OP.GG se načítá po 20 hrách. Vyšší počet nebo starší datum proto může trvat déle.</span></div>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" className="btn-ghost" onClick={onCancel} disabled={importing}>Zrušit</button><button type="button" className="btn-blue" onClick={() => void submit()} disabled={importing || (mode === 'count' ? !countIsValid : !sinceIso)}>{importing ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />} {importing ? 'Načítám z OP.GG…' : 'Načíst hry'}</button></div>
      </div>
    </div>
  )
}

function statisticSortValue(row: PlayerAggregate, key: StatisticsSortKey): string | number {
  if (key === 'displayName') return row.displayName
  if (key === 'games') return row.games
  if (key === 'wins') return row.wins - row.losses
  if (key === 'winRate') return row.wins / row.games
  if (key === 'kills') return row.kills / row.games
  if (key === 'kda') return (row.kills + row.assists) / Math.max(1, row.deaths)
  if (key === 'performance') return row.performanceSamples ? row.performance / row.performanceSamples : Number.NEGATIVE_INFINITY
  if (key === 'cs') return row.cs / row.games
  if (key === 'damage') return row.damageSamples ? row.damage / row.damageSamples : Number.NEGATIVE_INFINITY
  if (key === 'gold') return row.goldSamples ? row.gold / row.goldSamples : Number.NEGATIVE_INFINITY
  if (key === 'vision') return row.visionSamples ? row.vision / row.visionSamples : Number.NEGATIVE_INFINITY
  return row.favoriteChampion
}

function SortableHeader({ label, sortKey, activeKey, direction, onSort, className = '' }: { label: string; sortKey: StatisticsSortKey; activeKey: StatisticsSortKey; direction: 'asc' | 'desc'; onSort: (key: StatisticsSortKey) => void; className?: string }) {
  const active = activeKey === sortKey
  return <th className={className} aria-sort={active ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" className={`-mx-2 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 transition hover:bg-white/[.05] hover:text-slate-200 ${active ? 'bg-cyan/[.10] text-cyan shadow-[inset_0_0_0_1px_rgba(10,200,185,.14)]' : ''}`} onClick={() => onSort(sortKey)}>{label}<ChevronDown size={13} className={`transition ${active ? direction === 'asc' ? 'rotate-180 text-cyan' : 'text-cyan' : 'opacity-30'}`} /></button></th>
}

function StatisticsPanel({ history, onPlayerSelect }: { history: ConfirmedGame[]; onPlayerSelect: (playerId: string) => void }) {
  const stats = useMemo(() => calculatePlayerStats(history), [history])
  const insights = useMemo(() => buildGroupInsights(history), [history])
  const [sortKey, setSortKey] = useState<StatisticsSortKey>('games')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const syncedGames = history.filter((game) => game.match)
  const performances = syncedGames.reduce((total, game) => total + (game.match?.participants.length ?? 0), 0)
  const sortedStats = [...stats].sort((left, right) => {
    const leftValue = statisticSortValue(left, sortKey)
    const rightValue = statisticSortValue(right, sortKey)
    if (leftValue === Number.NEGATIVE_INFINITY || rightValue === Number.NEGATIVE_INFINITY) {
      if (leftValue === rightValue) return left.displayName.localeCompare(right.displayName, 'cs')
      return leftValue === Number.NEGATIVE_INFINITY ? 1 : -1
    }
    const comparison = typeof leftValue === 'string' && typeof rightValue === 'string' ? leftValue.localeCompare(rightValue, 'cs') : Number(leftValue) - Number(rightValue)
    return (sortDirection === 'asc' ? comparison : -comparison) || left.displayName.localeCompare(right.displayName, 'cs')
  })
  const sortBy = (key: StatisticsSortKey) => {
    if (key === sortKey) setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDirection(key === 'displayName' || key === 'favoriteChampion' ? 'asc' : 'desc') }
  }
  const maxRoleGames = Math.max(1, ...insights.roles.map((role) => role.games))
  if (!syncedGames.length) return (
    <Panel className="p-6 text-center"><BarChart3 className="mx-auto text-slate-700" size={30} /><h2 className="mt-3 font-display text-lg font-bold text-slate-400">Statistiky čekají na první výsledek</h2><p className="mt-2 text-sm text-slate-600">Po synchronizaci hry se tu objeví winrate, KDA, damage, vision i oblíbení šampioni.</p></Panel>
  )
  return <div className="space-y-6">
    <Panel className="stats-panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-cyan/10 bg-gradient-to-r from-cyan/[.055] via-transparent to-gold/[.045] p-5 sm:flex-row sm:items-end sm:justify-between md:p-6">
        <div><p className="eyebrow">Skutečné výsledky</p><h2 className="section-title mt-1 flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-lg border border-cyan/20 bg-cyan/[.09] text-cyan"><BarChart3 size={19} /></span> Statistiky hráčů</h2><p className="mt-2.5 text-[.78rem] text-slate-500">Klikni na řádek pro detail nebo na nadpis sloupce pro seřazení.</p></div>
        <div className="flex gap-2"><span className="rounded-lg border border-sky-400/15 bg-sky-400/[.07] px-3 py-2 text-xs text-sky-200"><b className="mr-1 font-display text-base text-sky-300">{syncedGames.length}</b> zápasů</span><span className="rounded-lg border border-violet-400/15 bg-violet-400/[.07] px-3 py-2 text-xs text-violet-200"><b className="mr-1 font-display text-base text-violet-300">{performances}</b> výkonů</span></div>
      </div>
      <div className="overflow-x-auto">
        <table className="stats-table w-full min-w-[1080px] text-left text-[.78rem]">
          <thead className="border-b border-white/[.08] text-[.64rem] uppercase tracking-[.08em] text-slate-500"><tr><SortableHeader label="Hráč" sortKey="displayName" activeKey={sortKey} direction={sortDirection} onSort={sortBy} className="px-5 py-3.5" /><SortableHeader label="Hry" sortKey="games" activeKey={sortKey} direction={sortDirection} onSort={sortBy} className="px-3 py-3.5" /><SortableHeader label="W/L" sortKey="wins" activeKey={sortKey} direction={sortDirection} onSort={sortBy} className="px-3 py-3.5" /><SortableHeader label="Winrate" sortKey="winRate" activeKey={sortKey} direction={sortDirection} onSort={sortBy} className="px-3 py-3.5" /><SortableHeader label="K / D / A" sortKey="kills" activeKey={sortKey} direction={sortDirection} onSort={sortBy} className="px-3 py-3.5" /><SortableHeader label="KDA" sortKey="kda" activeKey={sortKey} direction={sortDirection} onSort={sortBy} className="px-3 py-3.5" /><SortableHeader label="Výkon Ø" sortKey="performance" activeKey={sortKey} direction={sortDirection} onSort={sortBy} className="px-3 py-3.5" /><SortableHeader label="CS Ø" sortKey="cs" activeKey={sortKey} direction={sortDirection} onSort={sortBy} className="px-3 py-3.5" /><SortableHeader label="DMG Ø" sortKey="damage" activeKey={sortKey} direction={sortDirection} onSort={sortBy} className="px-3 py-3.5" /><SortableHeader label="Goldy Ø" sortKey="gold" activeKey={sortKey} direction={sortDirection} onSort={sortBy} className="px-3 py-3.5" /><SortableHeader label="Vision Ø" sortKey="vision" activeKey={sortKey} direction={sortDirection} onSort={sortBy} className="px-3 py-3.5" /><SortableHeader label="Nejhranější" sortKey="favoriteChampion" activeKey={sortKey} direction={sortDirection} onSort={sortBy} className="px-5 py-3.5" /></tr></thead>
          <tbody>{sortedStats.map((row) => {
            const rowWinRate = (row.wins / row.games) * 100
            const rowKda = (row.kills + row.assists) / Math.max(1, row.deaths)
            return <tr key={row.playerId} role="link" tabIndex={0} aria-label={`Otevřít statistiky hráče ${row.displayName}`} className="stats-table-row group cursor-pointer transition focus-visible:outline-none" onClick={() => onPlayerSelect(row.playerId)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPlayerSelect(row.playerId) } }}>
              <td className="border-l-2 border-transparent px-5 py-4 transition group-hover:border-cyan"><span className="flex items-center gap-2.5 text-sm font-extrabold text-white transition group-hover:text-cyan">{row.displayName}<ChevronRight size={15} className="text-slate-600 transition group-hover:translate-x-1 group-hover:text-cyan" /></span></td>
              <td className="px-3 py-4"><span className="rounded-md border border-sky-400/15 bg-sky-400/[.07] px-2 py-1 font-bold text-sky-300">{row.games}</span></td>
              <td className="px-3 py-4 font-bold"><span className="text-emerald-300">{row.wins}W</span><span className="mx-1 text-slate-700">/</span><span className="text-rose-300">{row.losses}L</span></td>
              <td className="px-3 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 font-extrabold ${winRateTone(rowWinRate)}`}>{oneDecimal.format(rowWinRate)} %</span></td>
              <td className="whitespace-nowrap px-3 py-4 font-semibold"><span className="text-emerald-300">{oneDecimal.format(row.kills / row.games)}</span><span className="mx-1 text-slate-700">/</span><span className="text-rose-300">{oneDecimal.format(row.deaths / row.games)}</span><span className="mx-1 text-slate-700">/</span><span className="text-sky-300">{oneDecimal.format(row.assists / row.games)}</span></td>
              <td className="px-3 py-4 font-extrabold text-amber-200">{oneDecimal.format(rowKda)}</td>
              <td className="px-3 py-4 font-extrabold text-cyan">{row.performanceSamples ? oneDecimal.format(row.performance / row.performanceSamples) : '—'}</td>
              <td className="px-3 py-4 font-semibold text-sky-300">{oneDecimal.format(row.cs / row.games)}</td>
              <td className="px-3 py-4 font-bold text-rose-200">{row.damageSamples ? integer.format(Math.round(row.damage / row.damageSamples)) : '—'}</td>
              <td className="px-3 py-4 font-semibold text-amber-200">{row.goldSamples ? integer.format(Math.round(row.gold / row.goldSamples)) : '—'}</td>
              <td className="px-3 py-4 font-semibold text-violet-300">{row.visionSamples ? oneDecimal.format(row.vision / row.visionSamples) : '—'}</td>
              <td className="px-5 py-4"><span className="rounded-md border border-violet-400/15 bg-violet-400/[.07] px-2 py-1 font-semibold text-violet-200">{row.favoriteChampion}</span></td>
            </tr>
          })}</tbody>
        </table>
      </div>
    </Panel>

    <div className="grid gap-6 xl:grid-cols-[minmax(22rem,.75fr)_minmax(0,1.25fr)]">
      <Panel className="stats-subpanel p-5 md:p-6"><p className="eyebrow">Týmová mapa</p><h3 className="section-title mt-1">Přehled pozic</h3><p className="mt-2 text-[.72rem] text-slate-500">TOP · JUNGLE · MID · ADC · SUPPORT</p><div className="mt-5 grid gap-3">{insights.roles.map((role) => { const tone = ROLE_TONES[role.role]; const roleWinRate = role.games ? (role.wins / role.games) * 100 : 0; return <div key={role.role} className={`rounded-xl border p-3.5 ${tone.border} ${tone.background}`}><div className="mb-2 flex items-center justify-between gap-3"><span className={`text-sm font-extrabold ${tone.text}`}>{ROLE_LABELS[role.role].title}</span><span className={`rounded-full border px-2 py-0.5 text-[.65rem] font-bold ${winRateTone(roleWinRate)}`}>{oneDecimal.format(roleWinRate)} % WR</span></div><div className="h-2.5 overflow-hidden rounded-full bg-black/20"><div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${(role.games / maxRoleGames) * 100}%` }} /></div><div className="mt-2 flex items-center justify-between text-[.68rem]"><span className="font-bold text-slate-400">{role.games} výkonů</span><button type="button" disabled={!role.topPlayerId} onClick={() => role.topPlayerId && onPlayerSelect(role.topPlayerId)} className="text-slate-500 transition enabled:hover:text-cyan">Nejčastěji <b className={tone.text}>{role.topPlayerName}</b>{role.topPlayerGames ? ` · ${role.topPlayerGames}×` : ''}</button></div></div> })}</div></Panel>
      <Panel className="stats-subpanel overflow-hidden"><div className="border-b border-white/[.08] bg-gradient-to-r from-violet-400/[.045] to-transparent p-5 md:p-6"><p className="eyebrow !text-violet-300">Společné výsledky</p><h3 className="section-title mt-1">Kdo s kým vyhrává</h3><p className="mt-2 text-[.72rem] text-slate-500">Stejná strana, stejný výsledek. Seřazeno od nejvyššího winratu.</p></div>{insights.pairs.length ? <div className="grid gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-3">{insights.pairs.slice(0, 18).map((pair) => { const winRate = (pair.wins / pair.games) * 100; const positive = winRate >= 50; return <div key={pair.playerIds.join('-')} className={`rounded-xl border p-3.5 transition hover:-translate-y-0.5 ${positive ? 'border-emerald-400/15 bg-emerald-400/[.045] hover:border-emerald-400/30' : 'border-rose-400/15 bg-rose-400/[.04] hover:border-rose-400/30'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-extrabold text-white"><button type="button" className="transition hover:text-cyan" onClick={() => onPlayerSelect(pair.playerIds[0])}>{pair.playerNames[0]}</button><span className="mx-1.5 text-slate-600">+</span><button type="button" className="transition hover:text-cyan" onClick={() => onPlayerSelect(pair.playerIds[1])}>{pair.playerNames[1]}</button></p><p className="mt-1.5 text-[.68rem] font-semibold"><span className="text-emerald-300">{pair.wins}W</span><span className="mx-1 text-slate-700">/</span><span className="text-rose-300">{pair.losses}L</span><span className="ml-1.5 text-slate-500">· {pair.games} her</span></p></div><strong className={`shrink-0 font-display text-xl ${positive ? 'text-emerald-300' : 'text-rose-300'}`}>{oneDecimal.format(winRate)} %</strong></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-rose-400/15"><div className={`h-full rounded-full ${positive ? 'bg-gradient-to-r from-emerald-500/60 to-emerald-300' : 'bg-gradient-to-r from-rose-500/60 to-rose-300'}`} style={{ width: `${winRate}%` }} /></div></div> })}</div> : <p className="p-6 text-sm text-slate-600">Zatím nejsou načtené žádné společné zápasy.</p>}</Panel>
    </div>

    <Panel className="stats-subpanel overflow-hidden"><div className="border-b border-white/[.08] bg-gradient-to-r from-gold/[.05] to-transparent p-5 md:p-6"><p className="eyebrow !text-amber-200">Preference skupiny</p><h3 className="section-title mt-1">Kdo kde a co hraje</h3></div><div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3 md:p-6">{insights.players.map((player) => { const tone = ROLE_TONES[player.primaryRole]; return <button key={player.playerId} type="button" className={`group rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${tone.border} ${tone.background}`} onClick={() => onPlayerSelect(player.playerId)}><div className="flex items-center justify-between gap-3"><strong className="truncate text-base text-white transition group-hover:text-cyan">{player.displayName}</strong><ChevronRight size={16} className={`shrink-0 transition group-hover:translate-x-1 ${tone.text}`} /></div><div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-lg border border-white/[.05] bg-black/15 p-2.5"><span className="text-[.58rem] font-bold uppercase tracking-wider text-slate-600">Hlavní pozice</span><b className={`mt-1 block text-sm ${tone.text}`}>{ROLE_LABELS[player.primaryRole].short} · {player.primaryRoleGames}×</b></div><div className="rounded-lg border border-white/[.05] bg-black/15 p-2.5"><span className="text-[.58rem] font-bold uppercase tracking-wider text-slate-600">Nejhranější champ</span><b className="mt-1 block truncate text-sm text-amber-200">{player.favoriteChampion} · {player.favoriteChampionGames}×</b></div></div><div className="mt-3 flex flex-wrap gap-1.5">{player.roles.map((role) => { const roleTone = ROLE_TONES[role.role]; return <span key={role.role} className={`rounded-md border px-2 py-1 text-[.62rem] font-semibold ${roleTone.border} ${roleTone.background} ${roleTone.text}`}>{ROLE_LABELS[role.role].short} {role.games}× · {oneDecimal.format((role.wins / role.games) * 100)} %</span> })}</div></button> })}</div></Panel>
  </div>
}

function PlayerDetailPanel({ playerId, player, history, onBack, onPlayerSelect }: { playerId: string; player: Player | null; history: ConfirmedGame[]; onBack: () => void; onPlayerSelect: (playerId: string) => void }) {
  let identity: Pick<Player, 'id' | 'name' | 'riotId'> = player ?? { id: playerId, name: 'Neznámý hráč', riotId: '' }
  if (!player) for (const game of history) {
    const participant = game.match?.participants.find((item) => item.playerId === playerId)
    if (participant) { identity = { id: playerId, name: participant.displayName, riotId: participant.riotId }; break }
  }
  const detail = buildPlayerDetail(history, identity)
  const winRate = detail.games ? (detail.wins / detail.games) * 100 : 0
  const averageKda = (detail.kills + detail.assists) / Math.max(1, detail.deaths)
  const averageDamage = detail.damageSamples ? detail.damage / detail.damageSamples : 0
  const averagePerformance = detail.performanceSamples ? detail.performance / detail.performanceSamples : 0
  const maxRoleGames = Math.max(1, ...detail.roles.map((role) => role.games))
  const recentForm = detail.matches.slice(0, 10).reverse()
  const teammates = buildGroupInsights(history).pairs.filter((pair) => pair.playerIds.includes(playerId)).map((pair) => ({ ...pair, teammateId: pair.playerIds[0] === playerId ? pair.playerIds[1] : pair.playerIds[0], teammateName: pair.playerIds[0] === playerId ? pair.playerNames[1] : pair.playerNames[0] })).sort((left, right) => (right.wins / right.games) - (left.wins / left.games) || right.games - left.games)

  const strengthIcon = (key: (typeof detail.strengths)[number]['key']) => {
    if (key === 'form') return Trophy
    if (key === 'kda') return Swords
    if (key === 'damage') return Crosshair
    if (key === 'vision') return Eye
    if (key === 'performance') return BarChart3
    return Coins
  }

  const strengthTone = (key: (typeof detail.strengths)[number]['key']): { card: string; text: string } => {
    if (key === 'form') return { card: 'border-emerald-400/20 bg-emerald-400/[.055]', text: 'text-emerald-300' }
    if (key === 'kda') return { card: 'border-amber-400/20 bg-amber-400/[.055]', text: 'text-amber-200' }
    if (key === 'damage') return { card: 'border-rose-400/20 bg-rose-400/[.055]', text: 'text-rose-300' }
    if (key === 'vision') return { card: 'border-violet-400/20 bg-violet-400/[.055]', text: 'text-violet-300' }
    if (key === 'performance') return { card: 'border-cyan/20 bg-cyan/[.055]', text: 'text-cyan' }
    return { card: 'border-sky-400/20 bg-sky-400/[.055]', text: 'text-sky-300' }
  }

  const profileMetrics = [
    { label: 'Bilance', value: `${detail.wins} / ${detail.losses}`, hint: 'výhry / prohry', card: 'border-sky-400/15 bg-sky-400/[.055]', valueClass: 'text-sky-300' },
    { label: 'Winrate', value: `${oneDecimal.format(winRate)} %`, hint: `${detail.games} her`, card: winRate >= 50 ? 'border-emerald-400/20 bg-emerald-400/[.06]' : 'border-rose-400/20 bg-rose-400/[.055]', valueClass: winRate >= 50 ? 'text-emerald-300' : 'text-rose-300' },
    { label: 'Průměrné KDA', value: oneDecimal.format(averageKda), hint: `${oneDecimal.format(detail.kills / detail.games)} / ${oneDecimal.format(detail.deaths / detail.games)} / ${oneDecimal.format(detail.assists / detail.games)}`, card: 'border-amber-400/20 bg-amber-400/[.055]', valueClass: 'text-amber-200' },
    { label: 'DMG Ø', value: detail.damageSamples ? integer.format(Math.round(averageDamage)) : '—', hint: `${detail.damageSamples} detailních her`, card: 'border-rose-400/20 bg-rose-400/[.055]', valueClass: 'text-rose-200' },
    { label: 'OP.GG Ø', value: detail.performanceSamples ? oneDecimal.format(averagePerformance) : '—', hint: `${detail.mvpCount}× MVP`, card: 'border-cyan/20 bg-cyan/[.055]', valueClass: 'text-cyan' },
    { label: 'TOP 3', value: integer.format(detail.topThreeCount), hint: 'pořadí v zápase', card: 'border-violet-400/20 bg-violet-400/[.055]', valueClass: 'text-violet-300' },
  ]

  return <div className="space-y-6">
    <Panel className="stats-panel overflow-hidden">
      <div className="flex flex-col gap-5 border-b border-cyan/10 bg-gradient-to-r from-cyan/[.055] via-transparent to-violet-400/[.045] p-5 sm:flex-row sm:items-center sm:justify-between md:p-7">
        <div className="flex min-w-0 items-center gap-4"><button type="button" className="btn-ghost !min-h-10 !px-3" onClick={onBack}><ArrowLeft size={17} /> Zpět</button><div className="min-w-0"><p className="eyebrow">Profil hráče</p><h2 className="mt-1 truncate font-display text-3xl font-bold text-gold-light">{detail.displayName}</h2>{detail.riotId && <p className="mt-1 truncate text-xs text-slate-500">{detail.riotId}</p>}</div></div>
        <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-cyan/20 bg-cyan/[.07] px-3 py-1.5 font-bold text-cyan">{detail.games} {detail.games === 1 ? 'hra' : detail.games >= 2 && detail.games <= 4 ? 'hry' : 'her'}</span>{detail.roles[0] && <span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-slate-300">Nejčastěji {ROLE_LABELS[detail.roles[0].role].title}</span>}</div>
      </div>
      {!detail.games ? <div className="grid min-h-56 place-items-center p-8 text-center"><div><BarChart3 className="mx-auto text-slate-700" size={34} /><h3 className="mt-3 font-display text-lg font-bold text-slate-400">Zatím bez načtených her</h3><p className="mt-2 text-sm text-slate-600">Načti historii OP.GG a profil se automaticky doplní.</p></div></div> : <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-3 xl:grid-cols-6 md:p-7">
        {profileMetrics.map((metric) => <div key={metric.label} className={`rounded-xl border p-4 transition hover:-translate-y-0.5 ${metric.card}`}><span className="text-[.62rem] font-bold uppercase tracking-[.1em] text-slate-500">{metric.label}</span><strong className={`mt-1.5 block font-display text-2xl ${metric.valueClass}`}>{metric.value}</strong><small className="mt-1.5 block truncate text-[.68rem] text-slate-500" title={metric.hint}>{metric.hint}</small></div>)}
      </div>}
    </Panel>

    {detail.games > 0 && <>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,.65fr)]">
        <Panel className="stats-subpanel p-5 md:p-6"><p className="eyebrow">Nejlepší ukazatele</p><h3 className="section-title mt-1">V čem se hráči daří</h3><p className="mt-2 text-[.72rem] text-slate-500">Vyhodnoceno relativně z uložených her; nejde o porovnání s celým žebříčkem.</p><div className="mt-5 grid gap-3 md:grid-cols-3">{detail.strengths.map((strength) => { const Icon = strengthIcon(strength.key); const tone = strengthTone(strength.key); return <div key={strength.key} className={`rounded-xl border p-4 transition hover:-translate-y-0.5 ${tone.card}`}><span className={`grid size-8 place-items-center rounded-lg border border-white/10 bg-black/10 ${tone.text}`}><Icon size={17} /></span><strong className="mt-3 block text-sm text-white">{strength.label}</strong><span className={`mt-1 block font-display text-xl font-bold ${tone.text}`}>{strength.value}</span><p className="mt-2 text-[.72rem] leading-5 text-slate-500">{strength.description}</p></div> })}</div></Panel>
        <Panel className="stats-subpanel p-5 md:p-6"><p className="eyebrow !text-violet-300">Posledních {recentForm.length}</p><h3 className="section-title mt-1">Aktuální forma</h3><div className="mt-5 grid h-32 items-end gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, recentForm.length)}, minmax(1.5rem, 1fr))` }}>{recentForm.map((match) => { const score = match.participant.performanceScore; return <div key={match.gameId} className="flex h-full min-w-0 flex-col justify-end" title={`${dateTime.format(new Date(match.startedAt))} · ${match.participant.championName} · ${match.participant.win ? 'Výhra' : 'Prohra'}${score ? ` · ${oneDecimal.format(score)}` : ''}`}><div className={`min-h-3 rounded-t-md ${match.participant.win ? 'bg-gradient-to-t from-emerald-500/70 to-emerald-300 shadow-[0_0_14px_rgba(52,211,153,.18)]' : 'bg-gradient-to-t from-rose-500/70 to-rose-300 shadow-[0_0_14px_rgba(251,113,133,.18)]'}`} style={{ height: `${Math.max(12, Math.min(100, score > 0 ? score * 10 : 35))}%` }} /><span className="mt-1.5 truncate text-center text-[.58rem] font-bold text-slate-500">{match.participant.championName.slice(0, 3)}</span></div> })}</div><div className="mt-4 flex items-center justify-between text-[.68rem]"><span className="font-semibold text-emerald-300">■ Výhra</span><span className="text-slate-500">výška = OP.GG skóre</span><span className="font-semibold text-rose-300">■ Prohra</span></div></Panel>
      </div>

      <Panel className="stats-subpanel overflow-hidden"><div className="border-b border-white/[.08] bg-gradient-to-r from-amber-400/[.05] to-transparent p-5 md:p-6"><p className="eyebrow !text-amber-200">Champion pool</p><h3 className="section-title mt-1">Nejhranější šampioni</h3></div><div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 md:p-6">{detail.champions.slice(0, 12).map((champion) => { const championKda = (champion.kills + champion.assists) / Math.max(1, champion.deaths); const championWinRate = (champion.wins / champion.games) * 100; const metrics = [{ label: 'KDA', value: oneDecimal.format(championKda), color: 'text-amber-200' }, { label: 'DMG Ø', value: champion.damageSamples ? integer.format(Math.round(champion.damage / champion.damageSamples)) : '—', color: 'text-rose-200' }, { label: 'CS Ø', value: oneDecimal.format(champion.cs / champion.games), color: 'text-sky-300' }, { label: 'OP.GG Ø', value: champion.performanceSamples ? oneDecimal.format(champion.performance / champion.performanceSamples) : '—', color: 'text-cyan' }]; return <article key={`${champion.championId}-${champion.championName}`} className="group rounded-xl border border-white/[.08] bg-white/[.025] p-4 transition hover:-translate-y-0.5 hover:border-amber-400/25 hover:bg-amber-400/[.035]"><div className="flex items-center gap-3">{champion.champion ? <ChampionImage champion={champion.champion} className="size-14 shrink-0 rounded-xl border border-amber-400/20 object-cover shadow-lg" /> : <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-amber-400/[.08] font-display text-xl text-amber-200">{champion.championName.slice(0, 1)}</div>}<div className="min-w-0 flex-1"><strong className="block truncate text-base text-white transition group-hover:text-amber-200">{champion.championName}</strong><p className="mt-1.5 text-[.7rem] text-slate-500">{champion.games} {champion.games === 1 ? 'hra' : champion.games >= 2 && champion.games <= 4 ? 'hry' : 'her'}</p><span className={`mt-1.5 inline-flex rounded-full border px-2 py-0.5 text-[.62rem] font-bold ${winRateTone(championWinRate)}`}>{oneDecimal.format(championWinRate)} % WR</span></div></div><dl className="mt-4 grid grid-cols-4 gap-1.5 border-t border-white/[.07] pt-3 text-center">{metrics.map((metric) => <div key={metric.label} className="min-w-0 rounded-md bg-black/10 px-1 py-2"><dt className="truncate text-[.56rem] font-semibold uppercase tracking-wide text-slate-600">{metric.label}</dt><dd className={`mt-1 truncate text-xs font-extrabold ${metric.color}`} title={metric.value}>{metric.value}</dd></div>)}</dl></article> })}</div></Panel>

      <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-6"><Panel className="stats-subpanel p-5 md:p-6"><p className="eyebrow">Rozložení rolí</p><h3 className="section-title mt-1">Kde hráč nastupuje</h3><div className="mt-5 grid gap-3">{detail.roles.map((role) => { const tone = ROLE_TONES[role.role]; const roleWinRate = (role.wins / role.games) * 100; return <div key={role.role} className={`rounded-lg border p-3 ${tone.border} ${tone.background}`}><div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className={`font-extrabold ${tone.text}`}>{ROLE_LABELS[role.role].title}</span><span className="text-slate-500">{role.games}× · <b className={roleWinRate >= 50 ? 'text-emerald-300' : 'text-rose-300'}>{oneDecimal.format(roleWinRate)} %</b></span></div><div className="h-2 overflow-hidden rounded-full bg-black/20"><div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${(role.games / maxRoleGames) * 100}%` }} /></div></div> })}</div></Panel><Panel className="stats-subpanel overflow-hidden"><div className="border-b border-white/[.08] bg-gradient-to-r from-violet-400/[.045] to-transparent p-5"><p className="eyebrow !text-violet-300">Spoluhráči</p><h3 className="section-title mt-1">Winrate ve dvojici</h3></div>{teammates.length ? <div className="divide-y divide-white/[.06]">{teammates.map((pair) => { const pairWinRate = (pair.wins / pair.games) * 100; return <button type="button" key={pair.teammateId} onClick={() => onPlayerSelect(pair.teammateId)} className="group flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition hover:bg-violet-400/[.04]"><span className="min-w-0"><b className="block truncate text-sm text-slate-200 transition group-hover:text-cyan">{pair.teammateName}</b><small className="mt-1 block text-[.68rem]"><span className="text-emerald-300">{pair.wins}W</span><span className="mx-1 text-slate-700">/</span><span className="text-rose-300">{pair.losses}L</span><span className="ml-1 text-slate-500">· {pair.games} her</span></small></span><span className={`shrink-0 rounded-full border px-2.5 py-1 font-display text-base font-bold ${winRateTone(pairWinRate)}`}>{oneDecimal.format(pairWinRate)} %</span></button> })}</div> : <p className="p-5 text-xs leading-5 text-slate-600">S žádným dalším uloženým hráčem zatím nemá společný zápas.</p>}</Panel></div>
        <Panel className="overflow-hidden"><div className="border-b border-white/[.08] p-5 md:p-6"><p className="eyebrow">Historie hráče</p><h3 className="section-title mt-1">Poslední hry</h3></div><div className="max-h-[40rem] overflow-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="sticky top-0 z-10 border-b border-white/[.07] bg-[#0b1424] text-[.58rem] uppercase tracking-wider text-slate-600"><tr><th className="px-5 py-3">Datum</th><th className="px-3 py-3">Šampion</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">Výsledek</th><th className="px-3 py-3">K / D / A</th><th className="px-3 py-3">KDA</th><th className="px-3 py-3">DMG</th><th className="px-3 py-3">Goldy</th><th className="px-3 py-3">CS</th><th className="px-3 py-3">Vision</th><th className="px-5 py-3">OP.GG</th></tr></thead><tbody className="divide-y divide-white/[.06]">{detail.matches.slice(0, 30).map((match) => { const participant = match.participant; const kda = (participant.kills + participant.assists) / Math.max(1, participant.deaths); return <tr key={match.gameId} className="hover:bg-white/[.025]"><td className="whitespace-nowrap px-5 py-3 text-slate-400">{dateTime.format(new Date(match.startedAt))}</td><td className="px-3 py-3 font-bold text-white">{participant.championName}</td><td className="px-3 py-3 text-slate-400">{ROLE_LABELS[match.role].short}</td><td className={`px-3 py-3 font-bold ${participant.win ? 'text-emerald-300' : 'text-red-300'}`}>{participant.win ? 'Výhra' : 'Prohra'}</td><td className="px-3 py-3 text-slate-200">{participant.kills} / {participant.deaths} / {participant.assists}</td><td className="px-3 py-3 text-gold-light">{oneDecimal.format(kda)}</td><td className="px-3 py-3 text-cyan">{participant.detailedStats ? integer.format(participant.totalDamageDealtToChampions) : '—'}</td><td className="px-3 py-3 text-gold-light">{participant.detailedStats ? integer.format(participant.goldEarned) : '—'}</td><td className="px-3 py-3 text-slate-300">{integer.format(participant.totalMinionsKilled + participant.neutralMinionsKilled)}</td><td className="px-3 py-3 text-slate-300">{participant.detailedStats ? integer.format(participant.visionScore) : '—'}</td><td className="px-5 py-3 font-bold text-cyan">{participant.performanceScore > 0 ? `${oneDecimal.format(participant.performanceScore)} · #${participant.performanceRank}` : '—'}</td></tr> })}</tbody></table></div></Panel>
      </div>
    </>}
  </div>
}

function SyncBadge({ game }: { game: ConfirmedGame }) {
  const styles = game.sync.status === 'synced' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : game.sync.status === 'error' ? 'border-red-400/25 bg-red-400/10 text-red-300' : game.sync.status === 'pending' ? 'border-cyan/25 bg-cyan/10 text-cyan' : 'border-white/10 bg-white/[.04] text-slate-500'
  const label = game.sync.status === 'synced' ? 'Výsledek načten' : game.sync.status === 'error' ? 'Chyba synchronizace' : game.sync.status === 'pending' ? 'Čeká na výsledek' : 'Bez Riot dat'
  return <span className={`rounded-full border px-2.5 py-1 text-[.62rem] font-bold ${styles}`}>{label}</span>
}

function performanceLabel(score: number, rank: number): string {
  if (rank === 1) return 'MVP'
  if (score >= 8.5) return 'Excelentní'
  if (score >= 7) return 'Skvělý'
  if (score >= 5.5) return 'Dobrý'
  if (score > 0) return 'Slabší'
  return 'Bez hodnocení'
}

function RecentGamesPanel({ history, importing, onImport, onClear, onPlayerSelect }: { history: ConfirmedGame[]; importing: boolean; onImport: () => void; onClear: () => void; onPlayerSelect: (playerId: string) => void }) {
  const games = [...history].sort((left, right) => Date.parse(right.confirmedAt) - Date.parse(left.confirmedAt))
  const missingDetails = games.filter((game) => game.match?.participants.some((participant) => !participant.detailedStats)).length
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-white/[.08] p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="eyebrow">Veřejná data OP.GG</p><h2 className="section-title mt-1 flex items-center gap-2"><Swords size={20} className="text-gold" /> Poslední hry</h2><p className="mt-2 text-xs text-slate-500">Každý zápas je jedna karta. Rozklikni ji pro damage graf a výkony celé vaší skupiny.</p></div><button type="button" className="btn-blue shrink-0 !min-h-9 !px-3 !text-xs" onClick={onImport} disabled={importing} title="Vybrat počet her nebo datum začátku importu z OP.GG">{importing ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />} {importing ? 'Načítám detaily…' : 'Načíst hry'}</button></div>
      {missingDetails > 0 && <div className="flex items-start gap-2 border-b border-amber-400/15 bg-amber-400/[.06] px-5 py-3 text-xs leading-5 text-amber-100/80"><AlertTriangle className="mt-0.5 shrink-0" size={15} /><span>{missingDetails} {missingDetails === 1 ? 'zápasu chybí detailní damage' : 'zápasům chybí detailní damage'}. Klikni na načtení znovu; uložené zápasy se aktualizují.</span></div>}
      {!games.length ? <div className="grid min-h-44 place-items-center p-8 text-center"><div><Swords className="mx-auto text-slate-700" size={30} /><p className="mt-3 text-sm text-slate-500">Načti poslední zápasy uložených hráčů.</p></div></div> : <>
        <div className="divide-y divide-white/[.07]">
          {games.map((game) => {
            const participants = game.match?.participants ?? []
            const wins = participants.filter((participant) => participant.win).length
            const result = wins === participants.length ? 'Výhra' : wins === 0 ? 'Prohra' : 'Smíšený výsledek'
            const resultClass = wins === participants.length ? 'text-emerald-300' : wins === 0 ? 'text-red-300' : 'text-amber-200'
            const detailedParticipants = participants.filter((participant) => participant.detailedStats)
            const maxDamage = Math.max(1, ...detailedParticipants.map((participant) => participant.totalDamageDealtToChampions))
            const totalDamage = detailedParticipants.reduce((total, participant) => total + participant.totalDamageDealtToChampions, 0)
            const averageKda = participants.reduce((total, participant) => total + ((participant.kills + participant.assists) / Math.max(1, participant.deaths)), 0) / Math.max(1, participants.length)
            const bestPerformance = [...participants].sort((left, right) => (left.performanceRank || 99) - (right.performanceRank || 99))[0]
            const startedAt = game.match?.gameStartedAt || game.confirmedAt
            const duration = game.match?.durationSeconds ? Math.round(game.match.durationSeconds / 60) : 0
            return <details key={game.id} className="group open:bg-white/[.018]">
              <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 transition hover:bg-white/[.025] sm:px-6">
                <span className={`rounded-md border px-3 py-2 text-xs font-extrabold uppercase tracking-wider ${wins === participants.length ? 'border-emerald-400/20 bg-emerald-400/[.08] text-emerald-300' : wins === 0 ? 'border-red-400/20 bg-red-400/[.08] text-red-300' : 'border-amber-400/20 bg-amber-400/[.08] text-amber-200'}`}>{result}</span>
                <span className="min-w-0"><strong className="block font-display text-base text-gold-light">{dateTime.format(new Date(startedAt))}</strong><small className="mt-1 block truncate text-xs text-slate-500">{game.match?.gameMode || 'League of Legends'}{duration ? ` · ${duration} min` : ''} · našich hráčů: <b className="text-slate-300">{participants.length}</b><span className="hidden md:inline"> · {participants.map((participant) => participant.displayName).join(', ')}</span></small></span>
                <ChevronDown size={18} className="text-slate-500 transition group-open:rotate-180" />
              </summary>
              <div className="border-t border-white/[.06] bg-black/10 p-5 sm:p-6">
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4"><div className="rounded-lg border border-white/[.06] bg-white/[.025] p-3"><span className="text-[.6rem] font-bold uppercase tracking-wider text-slate-600">Naši hráči</span><strong className="mt-1 block font-display text-xl text-white">{participants.length}</strong></div><div className="rounded-lg border border-white/[.06] bg-white/[.025] p-3"><span className="text-[.6rem] font-bold uppercase tracking-wider text-slate-600">Celkový DMG</span><strong className="mt-1 block font-display text-xl text-gold-light">{detailedParticipants.length ? integer.format(totalDamage) : '—'}</strong></div><div className="rounded-lg border border-white/[.06] bg-white/[.025] p-3"><span className="text-[.6rem] font-bold uppercase tracking-wider text-slate-600">Průměrné KDA</span><strong className="mt-1 block font-display text-xl text-cyan">{oneDecimal.format(averageKda)}</strong></div><div className="rounded-lg border border-white/[.06] bg-white/[.025] p-3"><span className="text-[.6rem] font-bold uppercase tracking-wider text-slate-600">Nejlepší výkon</span><strong className="mt-1 block truncate font-display text-xl text-white" title={bestPerformance?.displayName}>{bestPerformance?.displayName ?? '—'}</strong></div></div>
                <div className="mt-5 rounded-xl border border-white/[.07] bg-white/[.018] p-4 sm:p-5"><div className="mb-5 flex items-center justify-between gap-4"><div><p className="eyebrow">Damage do šampionů</p><h3 className="mt-1 font-display text-lg font-bold text-white">Porovnání našich hráčů</h3></div><span className={`text-xs font-bold ${resultClass}`}>{result}</span></div>
                  {detailedParticipants.length ? <div className="grid gap-3">{[...participants].sort((left, right) => right.totalDamageDealtToChampions - left.totalDamageDealtToChampions).map((participant) => <div key={participant.playerId} className="grid grid-cols-[minmax(4.5rem,7rem)_minmax(0,1fr)_4.5rem] items-center gap-3"><span className="min-w-0"><b className="block truncate text-xs text-slate-200" title={participant.displayName}>{participant.displayName}</b><small className="block truncate text-[.62rem] text-slate-600">{participant.championName}</small></span><div className="h-8 overflow-hidden rounded-md border border-white/[.06] bg-white/[.035]"><div className="h-full rounded-sm bg-gradient-to-r from-cyan/35 via-cyan/70 to-cyan shadow-[0_0_18px_rgba(10,200,185,.18)] transition-all" style={{ width: `${participant.detailedStats ? Math.max(3, (participant.totalDamageDealtToChampions / maxDamage) * 100) : 0}%` }} /></div><strong className="text-right text-xs text-gold-light">{participant.detailedStats ? integer.format(participant.totalDamageDealtToChampions) : '—'}</strong></div>)}</div> : <div className="rounded-lg border border-dashed border-amber-400/20 p-5 text-sm text-amber-100/70">Detail damage zatím chybí. Znovu načti poslední hry.</div>}
                </div>
                <div className="mt-6"><div className="mb-3 flex items-end justify-between"><div><p className="eyebrow">Jednotlivé výkony</p><h3 className="mt-1 font-display text-lg font-bold text-white">Hráči v zápase</h3></div><span className="text-xs text-slate-600">Detailní data a pořadí podle OP.GG</span></div><div className="overflow-x-auto pb-1"><div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(1, participants.length)}, minmax(0, 1fr))`, minWidth: `${Math.max(1, participants.length) * 17}rem` }}>{[...participants].sort((left, right) => (left.performanceRank || 99) - (right.performanceRank || 99)).map((participant) => {
                    const kda = (participant.kills + participant.assists) / Math.max(1, participant.deaths)
                    const slot = game.slots.find((item) => item.playerId === participant.playerId)
                    const totalCs = participant.totalMinionsKilled + participant.neutralMinionsKilled
                    const damagePerMinute = participant.detailedStats && game.match?.durationSeconds
                      ? Math.round(participant.totalDamageDealtToChampions / (game.match.durationSeconds / 60))
                      : null
                    const metrics = [
                      { label: 'K / D / A', value: `${participant.kills} / ${participant.deaths} / ${participant.assists}`, className: 'text-slate-200' },
                      { label: 'KDA', value: oneDecimal.format(kda), className: 'text-gold-light' },
                      { label: 'DMG', value: participant.detailedStats ? integer.format(participant.totalDamageDealtToChampions) : '—', className: 'text-cyan' },
                      { label: 'DMG / min', value: damagePerMinute === null ? '—' : integer.format(damagePerMinute), className: 'text-cyan' },
                      { label: 'Goldy', value: participant.detailedStats ? integer.format(participant.goldEarned) : '—', className: 'text-gold-light' },
                      { label: 'CS', value: integer.format(totalCs), className: 'text-slate-200' },
                      { label: 'Vision', value: participant.detailedStats ? integer.format(participant.visionScore) : '—', className: 'text-slate-200' },
                      { label: 'Pořadí', value: participant.performanceRank > 0 ? `#${participant.performanceRank} / 10` : '—', className: 'text-slate-200' },
                    ]
                    return <article key={participant.playerId} className="rounded-xl border border-white/[.07] bg-white/[.025] p-3.5 transition hover:border-cyan/20 hover:bg-cyan/[.025]"><div className="flex items-start justify-between gap-3"><button type="button" className="group flex min-w-0 items-center gap-3 text-left" onClick={() => onPlayerSelect(participant.playerId)} title={`Otevřít profil hráče ${participant.displayName}`}>{slot && <ChampionImage champion={slot.champion} className="size-10 shrink-0 rounded-md object-cover" />}<span className="min-w-0"><span className="flex items-center gap-1"><strong className="truncate text-sm text-white transition group-hover:text-cyan">{participant.displayName}</strong><ChevronRight size={13} className="shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-cyan" /></span><span className="mt-0.5 block truncate text-xs text-slate-500"><span className={participant.win ? 'text-emerald-300' : 'text-red-300'}>{participant.win ? 'Výhra' : 'Prohra'}</span> · {participant.championName}{slot ? ` · ${ROLE_LABELS[slot.role].short}` : participant.teamPosition ? ` · ${participant.teamPosition}` : ''}</span></span></button><span className="shrink-0 rounded-full border border-cyan/20 bg-cyan/[.08] px-2 py-1 text-[.65rem] font-bold text-cyan">{performanceLabel(participant.performanceScore, participant.performanceRank)}{participant.performanceScore > 0 ? ` · ${oneDecimal.format(participant.performanceScore)}` : ''}</span></div><dl className="mt-3 grid grid-cols-4 gap-1.5 border-t border-white/[.06] pt-3 text-center">{metrics.map((metric) => <div key={metric.label} className="min-w-0 rounded-md bg-black/10 px-1 py-2"><dt className="truncate text-[.56rem] uppercase tracking-wide text-slate-600" title={metric.label}>{metric.label}</dt><dd className={`mt-1 truncate text-xs font-bold ${metric.className}`} title={metric.value}>{metric.value}</dd></div>)}</dl></article>
                  })}</div></div></div>
              </div>
            </details>
          })}
        </div>
        <div className="flex justify-end border-t border-white/[.07] px-5 py-3"><button type="button" className="btn-ghost !min-h-9 !px-3 !text-xs hover:!border-red-400/40 hover:!text-red-300" onClick={onClear}><Trash2 size={14} /> Smazat poslední hry</button></div>
      </>}
    </Panel>
  )
}

function HistoryPanel({ history, syncingIds, onSync, onUndo, onClear, onExport, onImport }: {
  history: ConfirmedGame[]
  syncingIds: Set<string>
  onSync: (game: ConfirmedGame) => void
  onUndo: () => void
  onClear: () => void
  onExport: () => void
  onImport: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  const importRef = useRef<HTMLInputElement>(null)
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-white/[.08] p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="eyebrow">Potvrzené sestavy</p><h2 className="section-title mt-1 flex items-center gap-2"><HistoryIcon size={20} className="text-gold" /> Historie randomizeru</h2></div><span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1 text-xs font-semibold text-slate-300">{history.length} {history.length === 1 ? 'hra' : history.length >= 2 && history.length <= 4 ? 'hry' : 'her'}</span></div>
      <div className="flex flex-wrap gap-2 border-b border-white/[.08] px-5 py-3"><button type="button" className="btn-ghost !min-h-9 !px-3 !text-xs" onClick={onUndo} disabled={!history.length}><Undo2 size={14} /> Vrátit poslední</button><button type="button" className="btn-ghost !min-h-9 !px-3 !text-xs" onClick={onExport}><Download size={14} /> Export všeho</button><button type="button" className="btn-ghost !min-h-9 !px-3 !text-xs" onClick={() => importRef.current?.click()}><Upload size={14} /> Import</button><button type="button" className="btn-ghost !min-h-9 !px-3 !text-xs hover:!border-red-400/40 hover:!text-red-300" onClick={onClear} disabled={!history.length}><Trash2 size={14} /> Vymazat sestavy</button><input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={onImport} /></div>
      {!history.length ? <div className="grid min-h-44 place-items-center p-8 text-center"><div><HistoryIcon className="mx-auto text-slate-700" size={30} /><p className="mt-3 text-sm text-slate-500">První potvrzená hra se objeví tady.</p></div></div> : (
        <div className="max-h-[52rem] divide-y divide-white/[.07] overflow-y-auto">
          {[...history].reverse().map((game) => {
            const syncing = syncingIds.has(game.id)
            const duration = game.match ? Math.round(game.match.durationSeconds / 60) : null
            return (
              <details key={game.id} className="group px-5 py-4 open:bg-white/[.02]" open={game === history.at(-1)}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-display text-sm font-bold text-gold-light">Hra #{game.number}</p><SyncBadge game={game} /></div><p className="mt-1 text-xs text-slate-500">{dateTime.format(new Date(game.confirmedAt))} · patch {game.patch}{game.match ? ` · ${game.match.gameMode}${duration ? ` · ${duration} min` : ''}` : ''}</p></div><ChevronDown size={17} className="shrink-0 text-slate-500 transition group-open:rotate-180" /></summary>
                {game.sync.status !== 'synced' && <div className="mt-4 flex flex-col gap-3 rounded-lg border border-white/[.07] bg-black/10 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-400">{game.sync.message ?? 'Výsledek zatím není načten.'}</p><button type="button" className="btn-blue shrink-0 !min-h-9 !px-3 !text-xs" onClick={() => onSync(game)} disabled={syncing}>{syncing ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCcw size={14} />} Načíst z OP.GG</button></div>}
                <div className="mt-4 grid gap-2">
                  {orderedByRole(game.slots).map((slot) => {
                    const actual = game.match?.participants.find((participant) => participant.playerId === slot.playerId)
                    return <div key={`${game.id}-${slot.playerId}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3"><ChampionImage champion={slot.champion} className="size-9 rounded object-cover" /><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-200">{slot.player}</p><p className="truncate text-[.68rem] text-slate-500">Plán: {slot.champion.name}{actual ? ` · Hrál: ${actual.championName}` : ''}</p></div>{actual ? <span className={`text-right text-[.68rem] font-bold ${actual.win ? 'text-emerald-300' : 'text-red-300'}`}>{actual.win ? 'VÝHRA' : 'PROHRA'}<small className="block font-normal text-slate-400">{actual.kills}/{actual.deaths}/{actual.assists}</small></span> : <span className="text-[.62rem] font-bold tracking-wider text-cyan/80">{slot.role}</span>}</div>
                  })}
                </div>
                {game.match && <p className="mt-4 break-all border-t border-white/[.06] pt-3 text-[.62rem] text-slate-600">{game.match.source === 'opgg' ? 'OP.GG' : 'Riot'} match: {game.match.matchId} · načteno {dateTime.format(new Date(game.match.fetchedAt))}</p>}
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
  const [importingRecent, setImportingRecent] = useState(false)
  const [recentImportOpen, setRecentImportOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<AppTab>('general')
  const [selectedStatsPlayerId, setSelectedStatsPlayerId] = useState<string | null>(null)
  const [syncingIds, setSyncingIds] = useState<Set<string>>(() => new Set())
  const [rosterReady, setRosterReady] = useState(() => !window.desktop?.roster)
  const rosterSnapshot = useRef<string | null>(null)
  const [statisticsReady, setStatisticsReady] = useState(() => !window.desktop?.statistics)
  const statisticsLoadState = useRef<'idle' | 'loading' | 'done'>('idle')
  const statisticsSnapshot = useRef<string | null>(null)
  const datasetInput = useRef<HTMLInputElement>(null)
  const dataset = state.customDataset ?? bundledDataset

  useEffect(() => {
    let active = true
    loadBundledDataset().then((data) => { if (active) setBundledDataset(data) }).catch((error: unknown) => { if (active) setLoadingError(error instanceof Error ? error.message : 'Dataset se nepodařilo načíst.') })
    const rosterBridge = window.desktop?.roster
    if (rosterBridge) rosterBridge.load().then(async (loaded) => {
      if (!active) return
      const localPlayers = stateRef.current.players
      if (!loaded.players.length && localPlayers.length) {
        const saved = await rosterBridge.save(localPlayers)
        if (!active) return
        rosterSnapshot.current = JSON.stringify(saved.players)
      } else {
        rosterSnapshot.current = JSON.stringify(loaded.players)
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
    document.documentElement.dataset.theme = state.settings.theme
  }, [state.settings.theme])

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
      }).catch((error: unknown) => setMessage({ type: 'error', text: error instanceof Error ? `Hráče se nepodařilo uložit do souboru: ${error.message}` : 'Hráče se nepodařilo uložit do souboru.' }))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [rosterReady, state.players])

  useEffect(() => {
    const statisticsBridge = window.desktop?.statistics
    if (!dataset || !statisticsBridge || statisticsLoadState.current !== 'idle') return
    statisticsLoadState.current = 'loading'
    let active = true
    statisticsBridge.load().then((loaded) => {
      if (!active) return
      statisticsLoadState.current = 'done'
      statisticsSnapshot.current = JSON.stringify(loaded.matches)
      setState((current) => ({ ...current, history: mergeRecentMatches(current.history, loaded.matches, dataset).history }))
      setStatisticsReady(true)
    }).catch((error: unknown) => {
      if (!active) return
      statisticsLoadState.current = 'done'
      setMessage({ type: 'error', text: error instanceof Error ? `Soubor statistik se nepodařilo načíst: ${error.message}` : 'Soubor statistik se nepodařilo načíst.' })
    })
    return () => {
      active = false
      if (statisticsLoadState.current === 'loading') statisticsLoadState.current = 'idle'
    }
  }, [dataset])

  useEffect(() => {
    const statisticsBridge = window.desktop?.statistics
    if (!statisticsReady || !statisticsBridge) return
    const matches = matchesFromHistory(state.history)
    const serialized = JSON.stringify(matches)
    if (serialized === statisticsSnapshot.current) return
    const timer = window.setTimeout(() => {
      statisticsBridge.save(matches).then((saved) => {
        statisticsSnapshot.current = JSON.stringify(saved.matches)
      }).catch((error: unknown) => setMessage({ type: 'error', text: error instanceof Error ? `Statistiky se nepodařilo uložit do souboru: ${error.message}` : 'Statistiky se nepodařilo uložit do souboru.' }))
    }, 400)
    return () => window.clearTimeout(timer)
  }, [statisticsReady, state.history])

  const selectedPlayers = useMemo(() => state.players.filter((player) => state.selectedPlayerIds.includes(player.id)), [state.players, state.selectedPlayerIds])
  const cooldown = useMemo(() => getCooldownEntries(state.history, state.settings.cooldownGames), [state.history, state.settings.cooldownGames])
  const pendingSignature = state.history.filter((game) => game.sync.status === 'pending').map((game) => game.id).join('|')

  const patchCounts = useMemo(() => {
    if (!dataset) return null
    return Object.fromEntries(['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'].map((role) => [role, dataset.entries.filter((entry) => entry.role === role && entry.pickRate >= state.settings.minPickRate && entry.games >= state.settings.minGames).length])) as Record<Role, number>
  }, [dataset, state.settings.minGames, state.settings.minPickRate])

  const syncGame = useCallback(async (game: ConfirmedGame, silent = false) => {
    const bridge = window.desktop?.matches
    if (!bridge) {
      if (!silent) setMessage({ type: 'error', text: 'Načítání OP.GG historie funguje pouze v desktopové Electron aplikaci.' })
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
      const result = await bridge.syncGame({ gameId: game.id, confirmedAt: game.confirmedAt, region: current.settings.matchRegion, players, excludedMatchIds: current.history.flatMap((item) => item.match ? [item.match.matchId] : []) })
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

  const importRecentMatches = async (range: RecentMatchesRange): Promise<boolean> => {
    const bridge = window.desktop?.matches
    if (!bridge || !dataset) { setMessage({ type: 'error', text: 'Import OP.GG historie funguje pouze v desktopové aplikaci.' }); return false }
    const rosterPlayers = stateRef.current.players.filter((player) => player.riotId.includes('#'))
    const skipped = stateRef.current.players.length - rosterPlayers.length
    if (!rosterPlayers.length) { setMessage({ type: 'error', text: 'Alespoň jeden hráč musí mít vyplněné Riot ID ve formátu Jméno#TAG.' }); return false }
    if (rosterPlayers.length > 10) { setMessage({ type: 'error', text: 'Najednou lze načíst historii nejvýše deseti hráčů.' }); return false }
    setImportingRecent(true)
    setMessage(null)
    try {
      const current = stateRef.current
      const result = await bridge.importRecentMatches({
        cachedMatches: cachedMatchCoverage(current.history),
        region: current.settings.matchRegion,
        players: rosterPlayers.map((player) => ({ playerId: player.id, displayName: player.name, riotId: player.riotId })),
        range,
      })
      if (!result.matches.length) {
        setMessage({ type: 'success', text: result.cachedMatchesSkipped
          ? `Všech ${result.cachedMatchesSkipped} nalezených zápasů už máš kompletně uložených v cache.`
          : 'Ve zvoleném rozsahu nebyly na veřejných profilech OP.GG nalezeny žádné hry.' })
        return true
      }
      const merged = mergeRecentMatches(stateRef.current.history, result.matches, dataset)
      setState((value) => ({ ...value, history: merged.history }))
      const skippedText = skipped ? ` Bez Riot ID (přeskočeno): ${skipped}.` : ''
      const detailedMatches = result.matches.filter((match) => match.participants.every((participant) => participant.detailedStats)).length
      const importText = merged.added
        ? `Z OP.GG načteno ${merged.added} nových a aktualizováno ${merged.updated} dříve uložených zápasů pro ${result.playerCount} hráčů.`
        : `Z OP.GG aktualizováno ${merged.updated} uložených zápasů včetně detailních statistik.`
      const cacheText = result.cachedMatchesSkipped ? ` ${result.cachedMatchesSkipped} kompletních zápasů z cache nebylo stahováno znovu.` : ''
      setMessage({ type: 'success', text: `${importText} Damage načten u ${detailedMatches}/${result.matches.length} zápasů.${cacheText}${skippedText}` })
      return true
    } catch (error) {
      const text = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Import posledních zápasů se nezdařil.'
      setMessage({ type: 'error', text })
      return false
    } finally {
      setImportingRecent(false)
    }
  }

  useEffect(() => {
    if (!pendingSignature) return
    const runPending = () => {
      for (const game of stateRef.current.history.filter((item) => item.sync.status === 'pending')) void syncGame(game, true)
    }
    const initial = window.setTimeout(runPending, 4_000)
    const interval = window.setInterval(runPending, 3 * 60_000)
    return () => { window.clearTimeout(initial); window.clearInterval(interval) }
  }, [pendingSignature, syncGame])

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

  const undo = () => { const last = state.history.filter((game) => !game.origin || game.origin === 'confirmed').at(-1); if (!last || !window.confirm(`Vrátit hru #${last.number}? Cooldown i statistiky se přepočítají.`)) return; setState((current) => ({ ...current, history: current.history.filter((game) => game.id !== last.id) })) }
  const clear = () => { if (!window.confirm('Opravdu vymazat všechny potvrzené sestavy? Importované poslední hry zůstanou uložené.')) return; setState((current) => ({ ...current, history: current.history.filter((game) => game.origin === 'opgg-import' || game.origin === 'riot-import') })); setMessage({ type: 'success', text: 'Historie potvrzených sestav byla vymazána.' }) }
  const clearRecent = () => { if (!window.confirm('Opravdu smazat všechny importované poslední hry? Potvrzené sestavy zůstanou uložené.')) return; setState((current) => ({ ...current, history: current.history.filter((game) => !game.origin || game.origin === 'confirmed') })); setMessage({ type: 'success', text: 'Importované poslední hry byly vymazány.' }) }
  const resetApp = () => { if (!window.confirm('Obnovit celou aplikaci do výchozího stavu včetně rosteru a historie?')) return; setState(DEFAULT_STATE) }

  if (loadingError && !dataset) return <main className="grid min-h-screen place-items-center p-6"><Panel className="max-w-lg p-8 text-center"><AlertTriangle className="mx-auto text-red-300" /><h1 className="mt-4 font-display text-2xl text-gold-light">Data se nenačetla</h1><p className="mt-3 text-sm text-slate-400">{loadingError}</p></Panel></main>

  const confirmedHistory = state.history.filter((game) => !game.origin || game.origin === 'confirmed')
  const recentHistory = state.history.filter((game) => game.origin === 'opgg-import' || game.origin === 'riot-import')
  const openPlayerDetail = (playerId: string) => {
    setSelectedStatsPlayerId(playerId)
    setActiveTab('statistics')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const rosterPanel = (
    <Panel>
      <div className="border-b border-white/[.08] p-5">
        <div className="flex items-start justify-between gap-3">
          <div><p className="eyebrow">Stálý roster</p><h2 className="section-title mt-1">Hráči</h2></div>
          <details className="group relative">
            <summary className="btn-ghost cursor-pointer list-none !min-h-9 !px-2.5 !text-xs"><Settings2 size={15} /> Nastavení <ChevronDown size={14} className="transition group-open:rotate-180" /></summary>
            <div className="absolute right-0 z-30 mt-3 grid w-[min(30rem,calc(100vw-3rem))] gap-4 rounded-lg border border-white/10 bg-[#07101d] p-4 shadow-2xl xl:left-0 xl:right-auto xl:w-[30rem]">
              <div className="grid grid-cols-[1fr_auto] items-center gap-4 text-sm text-slate-300"><span>Vzhled aplikace</span><div className="flex rounded-md border border-white/10 bg-black/10 p-1"><button type="button" className={`inline-flex min-h-8 items-center gap-1.5 rounded px-2.5 text-xs font-bold transition ${state.settings.theme === 'dark' ? 'bg-cyan/15 text-cyan' : 'text-slate-500 hover:text-slate-200'}`} onClick={() => updateSettings({ theme: 'dark' })}><Moon size={14} /> Tmavý</button><button type="button" className={`inline-flex min-h-8 items-center gap-1.5 rounded px-2.5 text-xs font-bold transition ${state.settings.theme === 'light' ? 'bg-gold/20 text-gold-light' : 'text-slate-500 hover:text-slate-200'}`} onClick={() => updateSettings({ theme: 'light' })}><Sun size={14} /> Světlý</button></div></div>
              <label className="grid grid-cols-[1fr_7rem] items-center gap-4 text-sm text-slate-300"><span>Region historie <small className="block text-slate-600">pro veřejné profily OP.GG</small></span><select className="field !h-10 !px-3" value={state.settings.matchRegion} onChange={(event) => updateSettings({ matchRegion: event.target.value as Settings['matchRegion'] })}><option value="eune">EUNE</option><option value="euw">EUW</option></select></label>
              <label className="grid grid-cols-[1fr_7rem] items-center gap-4 text-sm text-slate-300"><span>Cooldown potvrzených her <small className="block text-slate-600">0–10 her</small></span><input className="field text-center" type="number" min="0" max="10" value={state.settings.cooldownGames} onChange={(event) => updateSettings({ cooldownGames: Math.max(0, Math.min(10, Number(event.target.value))) })} /></label>
              <label className="grid grid-cols-[1fr_7rem] items-center gap-4 text-sm text-slate-300"><span>Minimální pick rate <small className="block text-slate-600">v procentech</small></span><input className="field text-center" type="number" min="0" max="100" step="0.1" value={state.settings.minPickRate} onChange={(event) => updateSettings({ minPickRate: Math.max(0, Number(event.target.value)) })} /></label>
              <label className="grid grid-cols-[1fr_7rem] items-center gap-4 text-sm text-slate-300"><span>Minimální počet her</span><input className="field text-center" type="number" min="0" step="100" value={state.settings.minGames} onChange={(event) => updateSettings({ minGames: Math.max(0, Number(event.target.value)) })} /></label>
              <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/[.06] p-3"><div className="flex items-center gap-2 text-sm font-bold text-emerald-200"><Check size={16} /> Bez API klíče</div><p className="mt-1.5 text-xs leading-5 text-slate-500">Výsledky a zvolený počet posledních her aplikace čte z veřejných profilů OP.GG. Stačí správné Riot ID a zvolený region.</p></div>
              <button type="button" className="btn-ghost !text-xs hover:!border-red-400/30 hover:!text-red-300" onClick={resetApp}><Trash2 size={14} /> Obnovit celou aplikaci</button>
            </div>
          </details>
        </div>
      </div>

      <div className="border-b border-white/[.08] bg-black/10 p-4">
        <button type="button" className="btn-gold w-full" disabled={!dataset} onClick={() => generate('all')}><Shuffle size={18} /> Vygenerovat sestavu</button>
        <p className="mt-2 text-center text-xs text-slate-500"><strong className="text-cyan">{selectedPlayers.length}</strong> z {state.players.length} vybráno</p>
      </div>

      <div className="grid max-h-[34rem] gap-2 overflow-y-auto p-4">
        {state.players.map((player) => {
          const selected = state.selectedPlayerIds.includes(player.id)
          const editing = editingPlayer?.id === player.id ? editingPlayer : null
          return <div key={player.id} className={`rounded-lg border p-2.5 transition ${selected ? 'border-cyan/35 bg-cyan/[.06]' : 'border-white/[.07] bg-white/[.02]'}`}>{editing ? <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); saveEditedPlayer() }}><div className="flex items-center gap-2"><input type="checkbox" className="size-5 shrink-0 accent-[#0ac8b9]" checked={selected} onChange={() => togglePlayer(player.id)} aria-label={`${player.name} hraje`} /><input className="field !h-9 min-w-0 !px-2.5" value={editing.name} maxLength={40} onChange={(event) => setEditingPlayer({ ...editing, name: event.target.value })} aria-label="Jméno hráče" autoFocus /></div><input className="field !h-9 !px-2.5 text-xs" value={editing.riotId} maxLength={81} onChange={(event) => setEditingPlayer({ ...editing, riotId: event.target.value })} placeholder="Riot ID: Jméno#TAG (volitelné)" aria-label={`Riot ID hráče ${player.name}`} /><div className="flex justify-end gap-2"><button type="button" className="btn-ghost !min-h-8 !px-2.5 !text-xs" onClick={() => setEditingPlayer(null)}>Zrušit</button><button type="submit" className="btn-blue !min-h-8 !px-2.5 !text-xs"><Check size={13} /> Uložit</button></div></form> : <div className="flex items-center gap-2"><input type="checkbox" className="size-5 shrink-0 accent-[#0ac8b9]" checked={selected} onChange={() => togglePlayer(player.id)} aria-label={`${player.name} hraje`} /><button type="button" className="group flex min-w-0 flex-1 items-center gap-1 truncate px-1 text-left text-sm font-semibold text-slate-200 transition hover:text-cyan" title={`Otevřít profil hráče ${player.name}`} onClick={() => openPlayerDetail(player.id)}><span className="truncate">{player.name}</span><ChevronRight size={13} className="shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-cyan" /></button><details className="group relative"><summary className="btn-ghost cursor-pointer list-none !min-h-9 !px-2.5" aria-label={`Možnosti hráče ${player.name}`}><EllipsisVertical size={16} /></summary><div className="absolute right-0 z-20 mt-2 grid w-36 gap-1 rounded-lg border border-white/10 bg-[#07101d] p-1.5 shadow-2xl"><button type="button" className="flex items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-slate-300 transition hover:bg-white/[.07] hover:text-white" onClick={() => setEditingPlayer({ id: player.id, name: player.name, riotId: player.riotId })}><Pencil size={14} /> Upravit</button><button type="button" className="flex items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-red-300 transition hover:bg-red-400/10" onClick={() => removePlayer(player)}><Trash2 size={14} /> Smazat</button></div></details></div>}</div>
        })}
        {!state.players.length && <div className="rounded-lg border border-dashed border-white/10 p-5 text-center text-sm text-slate-600">Přidej prvního hráče.</div>}
      </div>

      <div className="border-t border-white/[.08] bg-black/10 p-4">
        <div className="grid gap-2"><input className="field !h-10" value={newPlayerName} onChange={(event) => setNewPlayerName(event.target.value)} placeholder="Jméno hráče" maxLength={40} onKeyDown={(event) => { if (event.key === 'Enter') addPlayer() }} /><input className="field !h-10" value={newPlayerRiotId} onChange={(event) => setNewPlayerRiotId(event.target.value)} placeholder="Riot ID / tag (volitelné)" maxLength={81} onKeyDown={(event) => { if (event.key === 'Enter') addPlayer() }} /><button type="button" className="btn-blue !min-h-10" onClick={addPlayer}><Plus size={16} /> Přidat hráče</button></div>
      </div>
    </Panel>
  )

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[.07] bg-[#040913]/75 backdrop-blur-xl"><div className="mx-auto flex max-w-[1900px] flex-col gap-5 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8"><div className="flex items-center gap-4"><div className="grid size-12 shrink-0 rotate-45 place-items-center border border-gold/60 bg-gold/10 shadow-gold"><Dice5 className="-rotate-45 text-gold" size={24} /></div><div><p className="eyebrow">Summoner's Rift · uložený roster</p><h1 className="font-display text-2xl font-extrabold tracking-wide text-gold-light sm:text-3xl">LoL Randomizer</h1></div></div>{dataset ? <div className="flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full border px-3 py-1.5 font-bold ${isDatasetStale(dataset) ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'}`}>{isDatasetStale(dataset) ? 'Snapshot je zastaralý' : 'Snapshot je aktuální'}</span><span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-slate-300">Patch {dataset.patch}</span></div> : <span className="text-sm text-slate-500">Načítám role data…</span>}</div></header>

      <nav className="sticky top-0 z-40 border-b border-white/[.08] bg-[#040913]/90 backdrop-blur-xl" aria-label="Hlavní sekce aplikace"><div className="mx-auto flex max-w-[1900px] gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">{([
        { id: 'general', label: 'Obecné', icon: Dice5 },
        { id: 'statistics', label: 'Statistiky', icon: BarChart3 },
        { id: 'recent', label: 'Poslední hry', icon: HistoryIcon },
      ] as const).map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => { setActiveTab(id); setSelectedStatsPlayerId(null) }} className={`relative flex min-h-14 shrink-0 items-center gap-2 px-4 text-sm font-bold transition ${activeTab === id ? 'text-cyan' : 'text-slate-500 hover:text-slate-200'}`} aria-current={activeTab === id ? 'page' : undefined}><Icon size={17} /> {label}{activeTab === id && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-cyan shadow-[0_0_12px_rgba(10,200,185,.7)]" />}</button>)}</div></nav>

      <main className="mx-auto max-w-[1900px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        {message && <div className={`mb-6 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${message.type === 'error' ? 'border-red-400/25 bg-red-500/10 text-red-200' : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'}`} role="status"><span className="flex items-center gap-2">{message.type === 'error' ? <AlertTriangle size={17} /> : <Check size={17} />}{message.text}</span><button type="button" onClick={() => setMessage(null)} aria-label="Zavřít zprávu"><X size={16} /></button></div>}

        {activeTab === 'general' && <div className="grid items-start gap-6 xl:grid-cols-[280px_minmax(0,1fr)_300px] 2xl:grid-cols-[310px_minmax(0,1fr)_340px]">
          <aside className="xl:sticky xl:top-6">{rosterPanel}</aside>
          <div className="space-y-6">

            {state.draft ? <Panel className="overflow-hidden border-gold/20"><div className="flex flex-col gap-3 border-b border-white/[.08] px-5 py-5 sm:flex-row sm:items-end sm:justify-between md:px-7"><div><p className="eyebrow">Nepotvrzený návrh</p><h2 className="section-title mt-1">Tvoje sestava</h2></div><p className="text-xs text-slate-500">Reroll ani individuální změna linky nemění historii a cooldown</p></div><div className="grid grid-cols-5 gap-2 p-3 md:gap-3 md:p-5">{orderedByRole(state.draft.slots.map((slot, originalIndex) => ({ slot, originalIndex, role: slot.role }))).map(({ slot, originalIndex }, displayIndex) => <DraftCard key={`${state.draft!.id}-${slot.playerId}`} slot={slot} index={displayIndex} onReroll={() => rerollOne(originalIndex)} onRoleChange={(role) => changeRole(originalIndex, role)} />)}</div><div className="grid gap-3 border-t border-white/[.08] bg-black/10 p-4 sm:grid-cols-3 md:p-6"><button type="button" className="btn-ghost" onClick={() => generate('all')}><Shuffle size={17} /> Role i šampioni</button><button type="button" className="btn-blue" onClick={() => generate('champions')}><RefreshCcw size={17} /> Jen šampioni</button><button type="button" className="btn-gold !min-h-14" onClick={() => setConfirming(true)}><Swords size={20} /> 🎮 Jdeme do hry!</button></div></Panel> : <div className="grid min-h-[22rem] place-items-center rounded-xl border border-dashed border-white/10 bg-white/[.015] p-8 text-center"><div><Dice5 className="mx-auto text-slate-700" size={42} /><h2 className="mt-4 font-display text-xl font-bold text-slate-400">Zatím žádný návrh</h2><p className="mt-2 text-sm text-slate-600">Zaškrtni 1–5 uložených hráčů a nech náhodu rozhodnout.</p></div></div>}

            <HistoryPanel history={confirmedHistory} syncingIds={syncingIds} onSync={(game) => void syncGame(game)} onUndo={undo} onClear={clear} onExport={() => downloadJson(`lol-randomizer-history-${new Date().toISOString().slice(0, 10)}.json`, createHistoryBackup(state.history))} onImport={importHistory} />
          </div>

          <aside className="space-y-6 xl:sticky xl:top-6">
            <Panel className="overflow-hidden"><div className="border-b border-white/[.08] p-5"><p className="eyebrow">Globální zákaz</p><h2 className="section-title mt-1 flex items-center gap-2"><LockKeyhole size={19} className="text-gold" /> Cooldown</h2></div>{!cooldown.length ? <div className="p-6 text-center"><Shield className="mx-auto text-emerald-400/40" size={28} /><p className="mt-3 text-sm text-slate-500">Žádný šampion není blokovaný.</p></div> : <div className="grid max-h-[25rem] grid-cols-2 gap-2 overflow-y-auto p-4">{cooldown.map((entry) => <div key={entry.champion.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-white/[.07] bg-white/[.025] p-2"><ChampionImage champion={entry.champion} className="size-9 shrink-0 rounded object-cover grayscale-[.4]" /><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-300">{entry.champion.name}</p><p className="text-[.65rem] text-amber-300/80">ještě {entry.remainingGames} {entry.remainingGames === 1 ? 'hra' : entry.remainingGames <= 4 ? 'hry' : 'her'}</p></div></div>)}</div>}<div className="border-t border-white/[.07] bg-black/10 px-5 py-3 text-xs leading-5 text-slate-500">Počítá se z posledních {state.settings.cooldownGames} potvrzených her bez ohledu na stav Riot synchronizace.</div></Panel>

            {dataset && <Panel className="p-5"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Role data</p><h2 className="section-title mt-1 flex items-center gap-2"><Database size={19} className="text-gold" /> Meta snapshot</h2></div>{state.customDataset && <span className="rounded border border-cyan/20 bg-cyan/10 px-2 py-1 text-[.6rem] font-bold text-cyan">VLASTNÍ</span>}</div><dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs"><dt className="text-slate-500">Patch</dt><dd className="text-right font-semibold text-slate-200">{dataset.patch}</dd><dt className="text-slate-500">Aktualizace</dt><dd className="text-right text-slate-300">{dataset.updatedAt}</dd><dt className="text-slate-500">Zdroj</dt><dd className="truncate text-right"><a className="text-cyan hover:underline" href={dataset.source.url} target="_blank" rel="noreferrer">{dataset.source.name}</a></dd></dl>{patchCounts && <div className="mt-4 grid grid-cols-5 gap-1">{Object.entries(patchCounts).map(([role, count]) => <div key={role} className="rounded bg-white/[.035] px-1 py-2 text-center"><span className="block text-[.56rem] font-bold text-slate-500">{role}</span><span className="mt-1 block text-xs font-bold text-slate-200">{count}</span></div>)}</div>}<div className="mt-4 grid gap-2"><button type="button" className="btn-blue" onClick={() => datasetInput.current?.click()}><Upload size={16} /> Importovat dataset</button>{state.customDataset && <button type="button" className="btn-ghost" onClick={() => { setState((current) => ({ ...current, customDataset: null })); setMessage({ type: 'success', text: 'Obnoven výchozí dataset.' }) }}><RefreshCcw size={16} /> Použít výchozí</button>}<input ref={datasetInput} type="file" accept="application/json,.json" className="hidden" onChange={importDataset} /></div></Panel>}

            <Panel className="p-5"><p className="eyebrow">Stav skupiny</p><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-white/[.035] p-3"><Users className="mx-auto text-cyan/70" size={17} /><strong className="mt-2 block font-display text-lg text-white">{state.players.length}</strong><span className="text-[.62rem] text-slate-500">uloženo</span></div><div className="rounded-lg bg-white/[.035] p-3"><UserRoundCheck className="mx-auto text-emerald-300/70" size={17} /><strong className="mt-2 block font-display text-lg text-white">{selectedPlayers.length}</strong><span className="text-[.62rem] text-slate-500">hraje</span></div><div className="rounded-lg bg-white/[.035] p-3"><Swords className="mx-auto text-gold/80" size={17} /><strong className="mt-2 block font-display text-lg text-white">{state.history.length}</strong><span className="text-[.62rem] text-slate-500">her</span></div></div></Panel>
          </aside>
        </div>}
        {activeTab === 'statistics' && (selectedStatsPlayerId ? <PlayerDetailPanel playerId={selectedStatsPlayerId} player={state.players.find((player) => player.id === selectedStatsPlayerId) ?? null} history={state.history} onBack={() => setSelectedStatsPlayerId(null)} onPlayerSelect={openPlayerDetail} /> : <StatisticsPanel history={state.history} onPlayerSelect={openPlayerDetail} />)}
        {activeTab === 'recent' && <RecentGamesPanel history={recentHistory} importing={importingRecent} onImport={() => setRecentImportOpen(true)} onClear={clearRecent} onPlayerSelect={openPlayerDetail} />}
        <footer className="mt-12 border-t border-white/[.07] py-8 text-xs leading-6 text-slate-600">LoL Randomizer není podporován společností Riot Games a neodráží názory Riot Games ani nikoho, kdo se oficiálně podílí na produkci nebo správě jejích her. Riot Games a všechny související vlastnosti jsou ochranné známky nebo registrované ochranné známky společnosti Riot Games, Inc.</footer>
      </main>
      {confirming && state.draft && <ConfirmDialog draft={state.draft} onCancel={() => setConfirming(false)} onConfirm={confirm} />}
      {recentImportOpen && <RecentImportDialog importing={importingRecent} onCancel={() => setRecentImportOpen(false)} onImport={importRecentMatches} />}
    </div>
  )
}
