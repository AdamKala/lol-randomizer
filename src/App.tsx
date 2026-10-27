import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Database,
  Dice5,
  Download,
  History as HistoryIcon,
  LockKeyhole,
  RefreshCcw,
  RotateCw,
  Settings2,
  Shield,
  Shuffle,
  Swords,
  Trash2,
  Undo2,
  Upload,
  Users,
  X,
} from 'lucide-react'
import type { AppState, ChampionRoleEntry, ConfirmedGame, Draft, MetaDataset, Role, Settings } from './types'
import { confirmDraft, generateDraft, getCooldownEntries, rerollOneChampion, validatePlayers } from './lib/randomizer'
import { isDatasetStale, loadBundledDataset, validateMetaDataset } from './lib/meta'
import {
  createHistoryBackup,
  DEFAULT_STATE,
  loadState,
  saveState,
  validateHistoryBackup,
} from './lib/storage'

const ROLE_LABELS: Record<Role, { short: string; title: string; mark: string }> = {
  TOP: { short: 'TOP', title: 'Horní lajna', mark: 'T' },
  JUNGLE: { short: 'JUNGLE', title: 'Džungle', mark: 'J' },
  MID: { short: 'MID', title: 'Středová lajna', mark: 'M' },
  ADC: { short: 'ADC', title: 'Spodní lajna', mark: 'A' },
  SUPPORT: { short: 'SUPPORT', title: 'Podpora', mark: 'S' },
}

const dateTime = new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' })
const integer = new Intl.NumberFormat('cs-CZ')

function RoleBadge({ role }: { role: Role }) {
  const data = ROLE_LABELS[role]
  return (
    <span className="inline-flex items-center gap-2 text-[.68rem] font-bold tracking-[.18em] text-cyan">
      <span className="grid size-7 place-items-center border border-cyan/30 bg-cyan/10 font-display text-xs text-[#76eee6] [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]">
        {data.mark}
      </span>
      <span>{data.short}</span>
    </span>
  )
}

function ChampionImage({ champion, className = '' }: { champion: ChampionRoleEntry; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return <div className={`grid place-items-center bg-gradient-to-br from-[#12263b] to-[#080d16] text-4xl font-bold text-gold/60 ${className}`}>{champion.name.slice(0, 1)}</div>
  }
  return (
    <img
      src={`${import.meta.env.BASE_URL}champions/${champion.slug}.png`}
      alt={`Portrét šampiona ${champion.name}`}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
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

function DraftCard({
  slot,
  index,
  onReroll,
}: {
  slot: Draft['slots'][number]
  index: number
  onReroll: () => void
}) {
  return (
    <article
      className="group relative overflow-hidden rounded-xl border border-white/10 bg-[#091322] shadow-xl transition duration-300 hover:-translate-y-1 hover:border-gold/35 hover:shadow-gold"
      style={{ animationDelay: `${index * 65}ms` }}
    >
      <div className="relative aspect-[5/4] overflow-hidden bg-[#070d17]">
        <ChampionImage champion={slot.champion} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#091322] via-transparent to-transparent" />
        <div className="absolute left-3 top-3"><RoleBadge role={slot.role} /></div>
        <button
          type="button"
          onClick={onReroll}
          className="absolute right-3 top-3 grid size-10 place-items-center rounded-full border border-white/15 bg-[#050a12]/80 text-slate-200 backdrop-blur transition hover:rotate-180 hover:border-cyan/60 hover:text-cyan"
          aria-label={`Přelosovat šampiona pro ${slot.player}`}
          title="Přelosovat pouze tohoto šampiona"
        >
          <RotateCw size={17} />
        </button>
      </div>
      <div className="relative -mt-3 px-4 pb-4">
        <p className="truncate text-xs font-semibold uppercase tracking-[.16em] text-slate-400" title={slot.player}>{slot.player}</p>
        <h3 className="mt-1 truncate font-display text-xl font-bold text-gold-light" title={slot.champion.name}>{slot.champion.name}</h3>
        <div className="mt-3 flex items-center justify-between border-t border-white/[.07] pt-3 text-[.68rem] text-slate-500">
          <span>{ROLE_LABELS[slot.role].title}</span>
          <span>{slot.champion.pickRate.toFixed(1)} % · {integer.format(slot.champion.games)} her</span>
        </div>
      </div>
    </article>
  )
}

function ConfirmDialog({ draft, onCancel, onConfirm }: { draft: Draft; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#02050a]/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="glass max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border-gold/30 p-5 shadow-gold md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Poslední kontrola</p>
            <h2 id="confirm-title" className="mt-2 font-display text-2xl font-bold text-gold-light">Opravdu jdete do hry?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Až teď se sestava zapíše do historie a šampioni dostanou cooldown.</p>
          </div>
          <button type="button" className="btn-ghost !min-h-9 !px-2" onClick={onCancel} aria-label="Zavřít"><X size={18} /></button>
        </div>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {draft.slots.map((slot) => (
            <div key={slot.player} className="flex min-w-0 items-center gap-3 rounded-lg border border-white/[.08] bg-white/[.035] p-2.5">
              <ChampionImage champion={slot.champion} className="size-11 shrink-0 rounded-md object-cover" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">{slot.player}</p>
                <p className="truncate text-xs text-slate-400">{ROLE_LABELS[slot.role].short} · {slot.champion.name}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="btn-ghost" onClick={onCancel}>Ještě ne</button>
          <button type="button" className="btn-gold" onClick={onConfirm}><Check size={18} /> Potvrdit odehranou hru</button>
        </div>
      </div>
    </div>
  )
}

function HistoryPanel({ history, onUndo, onClear, onExport, onImport }: {
  history: ConfirmedGame[]
  onUndo: () => void
  onClear: () => void
  onExport: () => void
  onImport: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  const importRef = useRef<HTMLInputElement>(null)
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-white/[.08] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">Odehrané sestavy</p>
          <h2 className="section-title mt-1 flex items-center gap-2"><HistoryIcon size={20} className="text-gold" /> Historie</h2>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1 text-xs font-semibold text-slate-300">{history.length} {history.length === 1 ? 'hra' : history.length >= 2 && history.length <= 4 ? 'hry' : 'her'}</span>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-white/[.08] px-5 py-3">
        <button type="button" className="btn-ghost !min-h-9 !px-3 !text-xs" onClick={onUndo} disabled={!history.length}><Undo2 size={14} /> Vrátit poslední</button>
        <button type="button" className="btn-ghost !min-h-9 !px-3 !text-xs" onClick={onExport} disabled={!history.length}><Download size={14} /> Export</button>
        <button type="button" className="btn-ghost !min-h-9 !px-3 !text-xs" onClick={() => importRef.current?.click()}><Upload size={14} /> Import</button>
        <button type="button" className="btn-ghost !min-h-9 !px-3 !text-xs hover:!border-red-400/40 hover:!text-red-300" onClick={onClear} disabled={!history.length}><Trash2 size={14} /> Vymazat</button>
        <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={onImport} />
      </div>
      {!history.length ? (
        <div className="grid min-h-44 place-items-center p-8 text-center">
          <div><HistoryIcon className="mx-auto text-slate-700" size={30} /><p className="mt-3 text-sm text-slate-500">První potvrzená hra se objeví tady.</p></div>
        </div>
      ) : (
        <div className="max-h-[38rem] divide-y divide-white/[.07] overflow-y-auto">
          {[...history].reverse().map((game) => (
            <details key={game.id} className="group px-5 py-4 open:bg-white/[.02]" open={game === history.at(-1)}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <div>
                  <p className="font-display text-sm font-bold text-gold-light">Hra #{game.number}</p>
                  <p className="mt-1 text-xs text-slate-500">{dateTime.format(new Date(game.confirmedAt))} · patch {game.patch}</p>
                </div>
                <ChevronDown size={17} className="text-slate-500 transition group-open:rotate-180" />
              </summary>
              <div className="mt-4 grid gap-2">
                {game.slots.map((slot) => (
                  <div key={`${game.id}-${slot.player}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                    <ChampionImage champion={slot.champion} className="size-9 rounded object-cover" />
                    <div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-200">{slot.player}</p><p className="truncate text-[.68rem] text-slate-500">{slot.champion.name}</p></div>
                    <span className="text-[.62rem] font-bold tracking-wider text-cyan/80">{slot.role}</span>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </Panel>
  )
}

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState())
  const [bundledDataset, setBundledDataset] = useState<MetaDataset | null>(null)
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const datasetInput = useRef<HTMLInputElement>(null)
  const dataset = state.customDataset ?? bundledDataset

  useEffect(() => {
    let active = true
    loadBundledDataset()
      .then((data) => { if (active) setBundledDataset(data) })
      .catch((error: unknown) => { if (active) setLoadingError(error instanceof Error ? error.message : 'Dataset se nepodařilo načíst.') })
    return () => { active = false }
  }, [])

  useEffect(() => { saveState(state) }, [state])

  const cooldown = useMemo(
    () => getCooldownEntries(state.history, state.settings.cooldownGames),
    [state.history, state.settings.cooldownGames],
  )

  const patchCounts = useMemo(() => {
    if (!dataset) return null
    return Object.fromEntries(['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'].map((role) => [
      role,
      dataset.entries.filter((entry) => entry.role === role && entry.pickRate >= state.settings.minPickRate && entry.games >= state.settings.minGames).length,
    ])) as Record<Role, number>
  }, [dataset, state.settings.minGames, state.settings.minPickRate])

  const updateSettings = (patch: Partial<Settings>) => {
    setState((current) => ({ ...current, settings: { ...current.settings, ...patch } }))
  }

  const run = (operation: () => Draft) => {
    try {
      const draft = operation()
      setState((current) => ({ ...current, draft }))
      setMessage(null)
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Losování se nepodařilo.' })
    }
  }

  const generate = (mode: 'all' | 'champions') => {
    if (!dataset) return
    const playerError = validatePlayers(state.players)
    if (playerError) return setMessage({ type: 'error', text: playerError })
    const fixedRoles = mode === 'champions' && state.draft ? state.draft.slots.map((slot) => slot.role) : undefined
    run(() => generateDraft(state.players, dataset, state.settings, state.history, Math.random, fixedRoles))
  }

  const rerollOne = (index: number) => {
    if (!dataset || !state.draft) return
    run(() => rerollOneChampion(state.draft!, index, dataset, state.settings, state.history))
  }

  const confirm = () => {
    if (!state.draft) return
    setState((current) => current.draft ? { ...current, history: confirmDraft(current.draft, current.history), draft: null } : current)
    setConfirming(false)
    setMessage({ type: 'success', text: 'Hra byla potvrzena. Cooldown je aktivní.' })
  }

  const updatePlayer = (index: number, value: string) => {
    setState((current) => ({ ...current, players: current.players.map((player, playerIndex) => playerIndex === index ? value : player) }))
  }

  const importDataset = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const imported = validateMetaDataset(JSON.parse(await file.text()))
      setState((current) => ({
        ...current,
        customDataset: imported,
        settings: { ...current.settings, minPickRate: imported.defaults.minPickRate, minGames: imported.defaults.minGames },
      }))
      setMessage({ type: 'success', text: `Dataset pro patch ${imported.patch} byl ověřen a aktivován.` })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Import datasetu selhal.' })
    }
  }

  const importHistory = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const history = validateHistoryBackup(JSON.parse(await file.text()))
      if (!window.confirm(`Nahradit aktuální historii (${state.history.length} her) zálohou (${history.length} her)?`)) return
      setState((current) => ({ ...current, history, draft: null }))
      setMessage({ type: 'success', text: 'Historie byla importována a cooldown přepočítán.' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Import historie selhal.' })
    }
  }

  const undo = () => {
    const last = state.history.at(-1)
    if (!last || !window.confirm(`Vrátit hru #${last.number}? Cooldown se automaticky přepočítá.`)) return
    setState((current) => ({ ...current, history: current.history.slice(0, -1) }))
  }

  const clear = () => {
    if (!window.confirm('Opravdu vymazat celou historii? Tuto akci nelze vrátit.')) return
    setState((current) => ({ ...current, history: [] }))
    setMessage({ type: 'success', text: 'Historie byla vymazána a všichni šampioni jsou odblokovaní.' })
  }

  const resetApp = () => {
    if (!window.confirm('Obnovit celou aplikaci do výchozího stavu včetně hráčů a historie?')) return
    setState(DEFAULT_STATE)
  }

  if (loadingError && !dataset) {
    return <main className="grid min-h-screen place-items-center p-6"><Panel className="max-w-lg p-8 text-center"><AlertTriangle className="mx-auto text-red-300" /><h1 className="mt-4 font-display text-2xl text-gold-light">Data se nenačetla</h1><p className="mt-3 text-sm text-slate-400">{loadingError}</p></Panel></main>
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[.07] bg-[#040913]/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-5 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-4">
            <div className="grid size-12 shrink-0 rotate-45 place-items-center border border-gold/60 bg-gold/10 shadow-gold"><Dice5 className="-rotate-45 text-gold" size={24} /></div>
            <div>
              <p className="eyebrow">Summoner's Rift · premade 5</p>
              <h1 className="font-display text-2xl font-extrabold tracking-wide text-gold-light sm:text-3xl">LoL Randomizer</h1>
            </div>
          </div>
          {dataset ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full border px-3 py-1.5 font-bold ${isDatasetStale(dataset) ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'}`}>
                {isDatasetStale(dataset) ? 'Snapshot je zastaralý' : 'Snapshot je aktuální'}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-slate-300">Patch {dataset.patch}</span>
              <span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-slate-400">{dataset.updatedAt}</span>
            </div>
          ) : <span className="text-sm text-slate-500">Načítám role data…</span>}
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        {message && (
          <div className={`mb-6 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${message.type === 'error' ? 'border-red-400/25 bg-red-500/10 text-red-200' : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'}`} role="status">
            <span className="flex items-center gap-2">{message.type === 'error' ? <AlertTriangle size={17} /> : <Check size={17} />}{message.text}</span>
            <button type="button" onClick={() => setMessage(null)} aria-label="Zavřít zprávu"><X size={16} /></button>
          </div>
        )}

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <Panel className="p-5 md:p-7">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="eyebrow">Sestav svůj tým</p>
                  <h2 className="section-title mt-1">Kdo dneska intí?</h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">Pět unikátních hráčů. Role se zamíchají, šampioni se vyberou ze skutečně hraných kombinací.</p>
                </div>
                <details className="group relative">
                  <summary className="btn-ghost cursor-pointer list-none"><Settings2 size={17} /> Nastavení <ChevronDown size={15} className="transition group-open:rotate-180" /></summary>
                  <div className="mt-3 grid gap-4 rounded-lg border border-white/10 bg-[#07101d] p-4 lg:absolute lg:right-0 lg:z-20 lg:w-[26rem] lg:shadow-2xl">
                    <label className="grid grid-cols-[1fr_7rem] items-center gap-4 text-sm text-slate-300"><span>Cooldown potvrzených her <small className="block text-slate-600">0–10 her</small></span><input className="field text-center" type="number" min="0" max="10" value={state.settings.cooldownGames} onChange={(event) => updateSettings({ cooldownGames: Math.max(0, Math.min(10, Number(event.target.value))) })} /></label>
                    <label className="grid grid-cols-[1fr_7rem] items-center gap-4 text-sm text-slate-300"><span>Minimální pick rate <small className="block text-slate-600">v procentech</small></span><input className="field text-center" type="number" min="0" max="100" step="0.1" value={state.settings.minPickRate} onChange={(event) => updateSettings({ minPickRate: Math.max(0, Number(event.target.value)) })} /></label>
                    <label className="grid grid-cols-[1fr_7rem] items-center gap-4 text-sm text-slate-300"><span>Minimální počet her</span><input className="field text-center" type="number" min="0" step="100" value={state.settings.minGames} onChange={(event) => updateSettings({ minGames: Math.max(0, Number(event.target.value)) })} /></label>
                    <p className="text-xs leading-5 text-slate-500">Kombinace musí splnit oba filtry. Příliš přísné hodnoty mohou zmenšit pool natolik, že sestavu nepůjde vytvořit.</p>
                    <button type="button" className="btn-ghost !text-xs hover:!border-red-400/30 hover:!text-red-300" onClick={resetApp}><Trash2 size={14} /> Obnovit celou aplikaci</button>
                  </div>
                </details>
              </div>

              <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {state.players.map((player, index) => (
                  <label key={index} className="block">
                    <span className="mb-2 block text-[.65rem] font-bold uppercase tracking-[.16em] text-slate-500">Hráč {index + 1}</span>
                    <input className="field" value={player} maxLength={40} onChange={(event) => updatePlayer(index, event.target.value)} placeholder={['Martin', 'Petr', 'Honza', 'Tomáš', 'Kuba'][index]} autoComplete="off" />
                  </label>
                ))}
              </div>
              <button type="button" className="btn-gold mt-5 w-full sm:w-auto" disabled={!dataset} onClick={() => generate('all')}><Shuffle size={18} /> Vygenerovat sestavu</button>
            </Panel>

            {state.draft ? (
              <Panel className="overflow-hidden border-gold/20">
                <div className="flex flex-col gap-3 border-b border-white/[.08] px-5 py-5 sm:flex-row sm:items-end sm:justify-between md:px-7">
                  <div><p className="eyebrow">Nepotvrzený návrh</p><h2 className="section-title mt-1">Tvoje sestava</h2></div>
                  <p className="text-xs text-slate-500">Reroll nemění historii ani cooldown</p>
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-2 md:p-6 lg:grid-cols-5">
                  {state.draft.slots.map((slot, index) => <DraftCard key={`${state.draft!.id}-${slot.player}`} slot={slot} index={index} onReroll={() => rerollOne(index)} />)}
                </div>
                <div className="grid gap-3 border-t border-white/[.08] bg-black/10 p-4 sm:grid-cols-3 md:p-6">
                  <button type="button" className="btn-ghost" onClick={() => generate('all')}><Shuffle size={17} /> Role i šampioni</button>
                  <button type="button" className="btn-blue" onClick={() => generate('champions')}><RefreshCcw size={17} /> Jen šampioni</button>
                  <button type="button" className="btn-gold !min-h-14 sm:row-span-1" onClick={() => setConfirming(true)}><Swords size={20} /> 🎮 Jdeme do hry!</button>
                </div>
              </Panel>
            ) : (
              <div className="grid min-h-[22rem] place-items-center rounded-xl border border-dashed border-white/10 bg-white/[.015] p-8 text-center">
                <div><Dice5 className="mx-auto text-slate-700" size={42} /><h2 className="mt-4 font-display text-xl font-bold text-slate-400">Zatím žádný návrh</h2><p className="mt-2 text-sm text-slate-600">Vyplň pět jmen a nech náhodu rozhodnout.</p></div>
              </div>
            )}

            <HistoryPanel
              history={state.history}
              onUndo={undo}
              onClear={clear}
              onExport={() => downloadJson(`lol-randomizer-history-${new Date().toISOString().slice(0, 10)}.json`, createHistoryBackup(state.history))}
              onImport={importHistory}
            />
          </div>

          <aside className="space-y-6 xl:sticky xl:top-6">
            <Panel className="overflow-hidden">
              <div className="border-b border-white/[.08] p-5"><p className="eyebrow">Globální zákaz</p><h2 className="section-title mt-1 flex items-center gap-2"><LockKeyhole size={19} className="text-gold" /> Cooldown</h2></div>
              {!cooldown.length ? (
                <div className="p-6 text-center"><Shield className="mx-auto text-emerald-400/40" size={28} /><p className="mt-3 text-sm text-slate-500">Žádný šampion není blokovaný.</p></div>
              ) : (
                <div className="grid max-h-[25rem] grid-cols-2 gap-2 overflow-y-auto p-4">
                  {cooldown.map((entry) => (
                    <div key={entry.champion.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-white/[.07] bg-white/[.025] p-2">
                      <ChampionImage champion={entry.champion} className="size-9 shrink-0 rounded object-cover grayscale-[.4]" />
                      <div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-300">{entry.champion.name}</p><p className="text-[.65rem] text-amber-300/80">ještě {entry.remainingGames} {entry.remainingGames === 1 ? 'hra' : entry.remainingGames <= 4 ? 'hry' : 'her'}</p></div>
                    </div>
                  ))}
                </div>
              )}
              <div className="border-t border-white/[.07] bg-black/10 px-5 py-3 text-xs leading-5 text-slate-500">Počítá se výhradně z posledních {state.settings.cooldownGames} potvrzených her.</div>
            </Panel>

            {dataset && (
              <Panel className="p-5">
                <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Role data</p><h2 className="section-title mt-1 flex items-center gap-2"><Database size={19} className="text-gold" /> Meta snapshot</h2></div>{state.customDataset && <span className="rounded border border-cyan/20 bg-cyan/10 px-2 py-1 text-[.6rem] font-bold text-cyan">VLASTNÍ</span>}</div>
                <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                  <dt className="text-slate-500">Patch</dt><dd className="text-right font-semibold text-slate-200">{dataset.patch}</dd>
                  <dt className="text-slate-500">Aktualizace</dt><dd className="text-right text-slate-300">{dataset.updatedAt}</dd>
                  <dt className="text-slate-500">Zdroj</dt><dd className="truncate text-right"><a className="text-cyan hover:underline" href={dataset.source.url} target="_blank" rel="noreferrer">{dataset.source.name}</a></dd>
                  <dt className="text-slate-500">Rozsah</dt><dd className="text-right leading-5 text-slate-300">{dataset.source.scope}</dd>
                </dl>
                <p className="mt-4 rounded-md border border-amber-400/15 bg-amber-400/[.06] p-3 text-[.7rem] leading-5 text-amber-100/70">Nejde o živé API. Dataset je verzovaný snapshot a po {dataset.staleAfterDays} dnech se viditelně označí jako zastaralý.</p>
                {patchCounts && <div className="mt-4 grid grid-cols-5 gap-1">{Object.entries(patchCounts).map(([role, count]) => <div key={role} className="rounded bg-white/[.035] px-1 py-2 text-center"><span className="block text-[.56rem] font-bold text-slate-500">{role}</span><span className="mt-1 block text-xs font-bold text-slate-200">{count}</span></div>)}</div>}
                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <button type="button" className="btn-blue" onClick={() => datasetInput.current?.click()}><Upload size={16} /> Importovat dataset</button>
                  {state.customDataset && <button type="button" className="btn-ghost" onClick={() => { setState((current) => ({ ...current, customDataset: null })); setMessage({ type: 'success', text: 'Obnoven výchozí dataset.' }) }}><RefreshCcw size={16} /> Použít výchozí</button>}
                  <input ref={datasetInput} type="file" accept="application/json,.json" className="hidden" onChange={importDataset} />
                </div>
              </Panel>
            )}

            <Panel className="p-5">
              <p className="eyebrow">Stav skupiny</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-white/[.035] p-3"><Users className="mx-auto text-cyan/70" size={17} /><strong className="mt-2 block font-display text-lg text-white">5</strong><span className="text-[.62rem] text-slate-500">hráčů</span></div>
                <div className="rounded-lg bg-white/[.035] p-3"><Swords className="mx-auto text-gold/80" size={17} /><strong className="mt-2 block font-display text-lg text-white">{state.history.length}</strong><span className="text-[.62rem] text-slate-500">her</span></div>
                <div className="rounded-lg bg-white/[.035] p-3"><LockKeyhole className="mx-auto text-amber-300/70" size={17} /><strong className="mt-2 block font-display text-lg text-white">{cooldown.length}</strong><span className="text-[.62rem] text-slate-500">blokací</span></div>
              </div>
            </Panel>
          </aside>
        </div>

        <footer className="mt-12 border-t border-white/[.07] py-8 text-xs leading-6 text-slate-600">
          LoL Randomizer není podporován společností Riot Games a neodráží názory Riot Games ani nikoho, kdo se oficiálně podílí na produkci nebo správě jejích her. Riot Games a všechny související vlastnosti jsou ochranné známky nebo registrované ochranné známky společnosti Riot Games, Inc.
        </footer>
      </main>

      {confirming && state.draft && <ConfirmDialog draft={state.draft} onCancel={() => setConfirming(false)} onConfirm={confirm} />}
    </div>
  )
}
