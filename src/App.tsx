import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  Database,
  Dice5,
  Download,
  EllipsisVertical,
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
  Trash2,
  Undo2,
  Upload,
  UserRoundCheck,
  Users,
  X,
} from 'lucide-react'
import { ROLES, type AppState, type ChampionRoleEntry, type ConfirmedGame, type Draft, type MetaDataset, type Player, type RecentMatchesRange, type Role, type RosterFileResult, type Settings } from './types'
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
type AppTab = 'general' | 'statistics' | 'recent'

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

function localDateValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function RecentImportDialog({ importing, onCancel, onImport }: { importing: boolean; onCancel: () => void; onImport: (range: RecentMatchesRange) => Promise<boolean> }) {
  const [mode, setMode] = useState<RecentMatchesRange['mode']>('count')
  const [count, setCount] = useState(10)
  const [sinceDate, setSinceDate] = useState(() => { const date = new Date(); date.setDate(date.getDate() - 7); return localDateValue(date) })
  const today = localDateValue(new Date())
  const countIsValid = Number.isInteger(count) && count >= 1 && count <= 100
  const submit = async () => {
    if ((mode === 'count' && !countIsValid) || (mode === 'since' && !sinceDate)) return
    const range: RecentMatchesRange = mode === 'count'
      ? { mode: 'count', count }
      : { mode: 'since', since: new Date(`${sinceDate}T00:00:00`).toISOString() }
    if (await onImport(range)) onCancel()
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#02050a]/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="recent-import-title">
      <div className="glass w-full max-w-lg rounded-xl border-cyan/25 p-5 shadow-2xl md:p-7">
        <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Import OP.GG</p><h2 id="recent-import-title" className="mt-2 font-display text-2xl font-bold text-gold-light">Načíst hry</h2><p className="mt-2 text-sm leading-6 text-slate-400">Vyber počet posledních her, nebo datum, od kterého je chceš zahrnout.</p></div><button type="button" className="btn-ghost !min-h-9 !px-2" onClick={onCancel} disabled={importing} aria-label="Zavřít"><X size={18} /></button></div>
        <div className="mt-6 grid grid-cols-2 gap-2 rounded-lg border border-white/[.08] bg-black/10 p-1.5"><button type="button" onClick={() => setMode('count')} className={`min-h-11 rounded-md px-3 text-sm font-bold transition ${mode === 'count' ? 'bg-cyan/15 text-cyan' : 'text-slate-500 hover:bg-white/[.04] hover:text-slate-200'}`}><HistoryIcon className="mr-2 inline" size={16} />Počet her</button><button type="button" onClick={() => setMode('since')} className={`min-h-11 rounded-md px-3 text-sm font-bold transition ${mode === 'since' ? 'bg-cyan/15 text-cyan' : 'text-slate-500 hover:bg-white/[.04] hover:text-slate-200'}`}><CalendarDays className="mr-2 inline" size={16} />Od data</button></div>
        <div className="mt-5 rounded-lg border border-white/[.08] bg-white/[.02] p-4">{mode === 'count' ? <label className="block"><span className="text-sm font-semibold text-slate-300">Posledních her každého hráče</span><input type="number" min="1" max="100" step="1" className="field mt-2" value={count} onChange={(event) => setCount(Number(event.target.value))} autoFocus /><small className="mt-2 block text-xs text-slate-600">Zadej číslo od 1 do 100.</small></label> : <label className="block"><span className="text-sm font-semibold text-slate-300">Načíst hry ode dne</span><input type="date" max={today} className="field mt-2" value={sinceDate} onChange={(event) => setSinceDate(event.target.value)} autoFocus /><small className="mt-2 block text-xs text-slate-600">Čas se počítá od půlnoci ve tvém místním čase.</small></label>}</div>
        <div className="mt-4 flex gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[.05] p-3 text-xs leading-5 text-amber-100/70"><AlertTriangle className="mt-0.5 shrink-0" size={15} /><span>OP.GG se načítá po stránkách. Kvůli rychlosti a šetrnosti je jeden import omezený na 100 her na hráče; datum se použije v tomto rozsahu.</span></div>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" className="btn-ghost" onClick={onCancel} disabled={importing}>Zrušit</button><button type="button" className="btn-blue" onClick={() => void submit()} disabled={importing || (mode === 'count' ? !countIsValid : !sinceDate)}>{importing ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />} {importing ? 'Načítám z OP.GG…' : 'Načíst hry'}</button></div>
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
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="border-b border-white/[.07] bg-black/10 text-[.62rem] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Hráč</th><th className="px-3 py-3">Hry</th><th className="px-3 py-3">W/L</th><th className="px-3 py-3">Winrate</th><th className="px-3 py-3">K / D / A</th><th className="px-3 py-3">KDA</th><th className="px-3 py-3">Výkon Ø</th><th className="px-3 py-3">CS Ø</th><th className="px-3 py-3">DMG Ø</th><th className="px-3 py-3">Vision Ø</th><th className="px-5 py-3">Nejhranější</th></tr></thead>
          <tbody className="divide-y divide-white/[.06]">
            {stats.map((row) => <tr key={row.playerId} className="hover:bg-white/[.025]"><td className="px-5 py-3 font-bold text-white">{row.displayName}</td><td className="px-3 py-3 text-slate-300">{row.games}</td><td className="px-3 py-3 text-slate-300">{row.wins}/{row.losses}</td><td className="px-3 py-3 text-cyan">{oneDecimal.format((row.wins / row.games) * 100)} %</td><td className="px-3 py-3 text-slate-300">{oneDecimal.format(row.kills / row.games)} / {oneDecimal.format(row.deaths / row.games)} / {oneDecimal.format(row.assists / row.games)}</td><td className="px-3 py-3 text-gold-light">{oneDecimal.format((row.kills + row.assists) / Math.max(1, row.deaths))}</td><td className="px-3 py-3 font-bold text-cyan">{row.performanceSamples ? oneDecimal.format(row.performance / row.performanceSamples) : '—'}</td><td className="px-3 py-3 text-slate-300">{oneDecimal.format(row.cs / row.games)}</td><td className="px-3 py-3 text-slate-300">{row.damageSamples ? integer.format(Math.round(row.damage / row.damageSamples)) : '—'}</td><td className="px-3 py-3 text-slate-300">{row.visionSamples ? oneDecimal.format(row.vision / row.visionSamples) : '—'}</td><td className="px-5 py-3 text-slate-300">{row.favoriteChampion}</td></tr>)}
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

function performanceLabel(score: number, rank: number): string {
  if (rank === 1) return 'MVP'
  if (score >= 8.5) return 'Excelentní'
  if (score >= 7) return 'Skvělý'
  if (score >= 5.5) return 'Dobrý'
  if (score > 0) return 'Slabší'
  return 'Bez hodnocení'
}

function RecentGamesPanel({ history, importing, onImport, onClear }: { history: ConfirmedGame[]; importing: boolean; onImport: () => void; onClear: () => void }) {
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
                <div className="mt-6"><div className="mb-3 flex items-end justify-between"><div><p className="eyebrow">Jednotlivé výkony</p><h3 className="mt-1 font-display text-lg font-bold text-white">Hráči v zápase</h3></div><span className="text-xs text-slate-600">Pořadí podle OP.GG</span></div><div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{[...participants].sort((left, right) => (left.performanceRank || 99) - (right.performanceRank || 99)).map((participant) => {
                    const kda = (participant.kills + participant.assists) / Math.max(1, participant.deaths)
                    const slot = game.slots.find((item) => item.playerId === participant.playerId)
                    return <article key={participant.playerId} className="rounded-xl border border-white/[.07] bg-white/[.025] p-3.5 transition hover:border-cyan/20 hover:bg-cyan/[.025]"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3">{slot && <ChampionImage champion={slot.champion} className="size-10 shrink-0 rounded-md object-cover" />}<div className="min-w-0"><strong className="block truncate text-sm text-white">{participant.displayName}</strong><p className="mt-0.5 truncate text-xs text-slate-500">{participant.championName}</p></div></div><span className="shrink-0 rounded-full border border-cyan/20 bg-cyan/[.08] px-2 py-1 text-[.65rem] font-bold text-cyan">{performanceLabel(participant.performanceScore, participant.performanceRank)}{participant.performanceScore > 0 ? ` · ${oneDecimal.format(participant.performanceScore)}` : ''}</span></div><dl className="mt-3 grid grid-cols-4 gap-2 border-t border-white/[.06] pt-3 text-center"><div><dt className="text-[.58rem] uppercase text-slate-600">K/D/A</dt><dd className="mt-1 text-xs font-bold text-slate-200">{participant.kills}/{participant.deaths}/{participant.assists}</dd></div><div><dt className="text-[.58rem] uppercase text-slate-600">KDA</dt><dd className="mt-1 text-xs font-bold text-gold-light">{oneDecimal.format(kda)}</dd></div><div><dt className="text-[.58rem] uppercase text-slate-600">DMG</dt><dd className="mt-1 text-xs font-bold text-cyan">{participant.detailedStats ? integer.format(participant.totalDamageDealtToChampions) : '—'}</dd></div><div><dt className="text-[.58rem] uppercase text-slate-600">OP.GG</dt><dd className="mt-1 text-xs font-bold text-slate-300">{participant.performanceRank > 0 ? `#${participant.performanceRank}/10` : '—'}</dd></div></dl></article>
                  })}</div></div>
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
  const [syncingIds, setSyncingIds] = useState<Set<string>>(() => new Set())
  const [rosterFile, setRosterFile] = useState<RosterFileResult | null>(null)
  const [rosterReady, setRosterReady] = useState(() => !window.desktop?.roster)
  const rosterSnapshot = useRef<string | null>(null)
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
        excludedMatchIds: current.history.flatMap((game) => (!game.origin || game.origin === 'confirmed') && game.match ? [game.match.matchId] : []),
        region: current.settings.matchRegion,
        players: rosterPlayers.map((player) => ({ playerId: player.id, displayName: player.name, riotId: player.riotId })),
        range,
      })
      if (!result.matches.length) {
        setMessage({ type: 'success', text: 'Ve zvoleném rozsahu nebyly na veřejných profilech OP.GG nalezeny žádné hry.' })
        return true
      }
      const merged = mergeRecentMatches(stateRef.current.history, result.matches, dataset)
      setState((value) => ({ ...value, history: merged.history }))
      const skippedText = skipped ? ` Bez Riot ID (přeskočeno): ${skipped}.` : ''
      const detailedMatches = result.matches.filter((match) => match.participants.every((participant) => participant.detailedStats)).length
      const importText = merged.added
        ? `Z OP.GG načteno ${merged.added} nových a aktualizováno ${merged.updated} dříve uložených zápasů pro ${result.playerCount} hráčů.`
        : `Z OP.GG aktualizováno ${merged.updated} uložených zápasů včetně detailních statistik.`
      setMessage({ type: 'success', text: `${importText} Damage načten u ${detailedMatches}/${result.matches.length} zápasů.${skippedText}` })
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
              <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/[.06] p-3"><div className="flex items-center gap-2 text-sm font-bold text-emerald-200"><Check size={16} /> Bez API klíče</div><p className="mt-1.5 text-xs leading-5 text-slate-500">Výsledky a až 100 posledních her aplikace čte z veřejných profilů OP.GG. Stačí správné Riot ID a zvolený region.</p></div>
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

      <nav className="sticky top-0 z-40 border-b border-white/[.08] bg-[#040913]/90 backdrop-blur-xl" aria-label="Hlavní sekce aplikace"><div className="mx-auto flex max-w-[1900px] gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">{([
        { id: 'general', label: 'Obecné', icon: Dice5 },
        { id: 'statistics', label: 'Statistiky', icon: BarChart3 },
        { id: 'recent', label: 'Poslední hry', icon: HistoryIcon },
      ] as const).map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setActiveTab(id)} className={`relative flex min-h-14 shrink-0 items-center gap-2 px-4 text-sm font-bold transition ${activeTab === id ? 'text-cyan' : 'text-slate-500 hover:text-slate-200'}`} aria-current={activeTab === id ? 'page' : undefined}><Icon size={17} /> {label}{activeTab === id && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-cyan shadow-[0_0_12px_rgba(10,200,185,.7)]" />}</button>)}</div></nav>

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
        {activeTab === 'statistics' && <StatisticsPanel history={state.history} />}
        {activeTab === 'recent' && <RecentGamesPanel history={recentHistory} importing={importingRecent} onImport={() => setRecentImportOpen(true)} onClear={clearRecent} />}
        <footer className="mt-12 border-t border-white/[.07] py-8 text-xs leading-6 text-slate-600">LoL Randomizer není podporován společností Riot Games a neodráží názory Riot Games ani nikoho, kdo se oficiálně podílí na produkci nebo správě jejích her. Riot Games a všechny související vlastnosti jsou ochranné známky nebo registrované ochranné známky společnosti Riot Games, Inc.</footer>
      </main>
      {confirming && state.draft && <ConfirmDialog draft={state.draft} onCancel={() => setConfirming(false)} onConfirm={confirm} />}
      {recentImportOpen && <RecentImportDialog importing={importingRecent} onCancel={() => setRecentImportOpen(false)} onImport={importRecentMatches} />}
    </div>
  )
}
