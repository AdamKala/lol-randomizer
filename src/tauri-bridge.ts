import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import type { MatchSummary, Player, RosterFileResult, StatisticsFileResult } from './types'
import { createRosterFile } from './lib/roster-file'
import { createStatisticsFile } from './lib/statistics-file'
import { importRecentPublicMatches, syncPublicMatch } from './lib/opgg'

if (Reflect.has(window, '__TAURI_INTERNALS__')) {
  window.desktop = Object.freeze({
    isTauri: true as const,
    platform: navigator.platform,
    matches: Object.freeze({
      syncGame: syncPublicMatch,
      importRecentMatches: importRecentPublicMatches,
    }),
    roster: Object.freeze({
      load: (): Promise<RosterFileResult> => invoke('load_roster'),
      save: (players: Player[]): Promise<RosterFileResult> => invoke('save_roster', { roster: createRosterFile(players) }),
    }),
    statistics: Object.freeze({
      load: (): Promise<StatisticsFileResult> => invoke('load_statistics'),
      save: (matches: MatchSummary[]): Promise<StatisticsFileResult> => invoke('save_statistics', { statistics: createStatisticsFile(matches) }),
    }),
  })

  document.addEventListener('click', (event) => {
    const target = event.target
    const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null
    if (!anchor || anchor.target !== '_blank') return
    try {
      const url = new URL(anchor.href)
      if (url.protocol !== 'https:') return
      event.preventDefault()
      void openUrl(url.href)
    } catch {
      // Neplatné odkazy zůstávají zablokované bezpečnostní politikou Tauri.
    }
  })
}
