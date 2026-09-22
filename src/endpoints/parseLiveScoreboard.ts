import * as cheerio from 'cheerio'
import { HLTVPage, HLTVPageElement, HLTVScraper } from '../scraper'
import { fromMapName, GameMap } from '../shared/GameMap'
import type { ScorebotSnapshotBoard } from '../scorebot/fetchLiveScoreboardSnapshot'

export type LiveScoreboardSides = {
  mapName: GameMap
  currentRoundText?: string
  ctName: string
  tName: string
  ctScore: number
  tScore: number
  ctIcon: string
  tIcon: string
}

export type LiveMatchScoreExtract = {
  score: {
    team1: { side: 'CT'; name: string; score: string; icon: string }
    team2: { side: 'T'; name: string; score: string; icon: string }
  }
  map: string
}

type MapScoreRow = {
  name: GameMap | string
  result?: {
    team1TotalRounds: number
    team2TotalRounds: number
    halfResults: Array<{ team1Rounds: number; team2Rounds: number }>
  }
  statsId?: number
}

const normalizeTeamName = (value: string | undefined): string =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const parseRoundNumber = (value: string | number | undefined): number | undefined => {
  if (value == null) return undefined
  const raw = String(value).trim()
  // Number('') === 0 — empty Flare .ctScore must not become a fake 0-0 board.
  if (raw === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

const isUnknownTeamName = (name: string | undefined): boolean => {
  const raw = String(name || '').trim()
  return !raw || raw.toLowerCase() === 'unknown'
}

/** SSR scoreboard is empty until React hydrates — names stay "Unknown". */
export const isHydratedLiveScoreboard = (
  live: LiveScoreboardSides | null | undefined
): live is LiveScoreboardSides =>
  Boolean(live) && !isUnknownTeamName(live!.ctName) && !isUnknownTeamName(live!.tName)

const imgSrc = ($el: HLTVPageElement): string =>
  $el.find('img').attr('src') || $el.find('img').attr('data-cookieblock-src') || ''

/** Map `#scoreboardElement.live-map-de_nuke` → GameMap.Nuke */
export const gameMapFromScoreboardClass = (
  className: string | undefined
): GameMap | undefined => {
  const token = String(className || '')
    .split(/\s+/)
    .find((c) => c.startsWith('live-map-'))
  if (!token) return undefined
  const slug = token.slice('live-map-'.length)
  const match = (Object.values(GameMap) as string[]).find((v) => v === slug)
  return match as GameMap | undefined
}

export const gameMapFromCurrentRoundText = (
  text: string | undefined
): GameMap | undefined => {
  const raw = String(text || '').trim()
  if (!raw) return undefined
  const name = raw.includes(' - ')
    ? raw.split(' - ').slice(1).join(' - ').trim()
    : raw.split('-').slice(1).join('-').trim()
  if (!name) return undefined
  const mapped = fromMapName(name)
  return mapped === GameMap.Default ? undefined : mapped
}

export const readLiveScoreboard = ($: HLTVPage): LiveScoreboardSides | null => {
  const ctScore = parseRoundNumber(
    $('.scoreboard .score .ctScore').first().trimText()
  )
  const tScore = parseRoundNumber(
    $('.scoreboard .score .tScore').first().trimText()
  )
  if (ctScore == null || tScore == null) {
    return null
  }

  const currentRoundText = $('.currentRoundText').first().trimText()
  const mapName =
    gameMapFromScoreboardClass($('#scoreboardElement').attr('class')) ||
    gameMapFromCurrentRoundText(currentRoundText)
  if (!mapName || mapName === GameMap.Default) {
    return null
  }

  const ctName =
    $('.ctTeamHeaderBg .teamName').first().trimText() ||
    $('.ctTeamHeaderBg').first().trimText() ||
    'Unknown'
  const tName =
    $('.tTeamHeaderBg .teamName').first().trimText() ||
    $('.tTeamHeaderBg').first().trimText() ||
    'Unknown'

  return {
    mapName,
    currentRoundText,
    ctName,
    tName,
    ctScore,
    tScore,
    ctIcon: imgSrc($('.ctTeamHeaderBg').first()),
    tIcon: imgSrc($('.tTeamHeaderBg').first())
  }
}

export const readLiveScoreboardFromHtml = (
  html: string
): LiveScoreboardSides | null => {
  if (!html) return null
  return readLiveScoreboard(HLTVScraper(cheerio.load(html)))
}

/**
 * Overlay React scoreboard totals onto the live map row.
 * mapholder `.results-team-score` lags (5-7 while board is 8-12).
 */
export const applyLiveScoreboardToMaps = <T extends MapScoreRow>(
  maps: T[],
  live: LiveScoreboardSides,
  team1Name?: string,
  team2Name?: string
): T[] => {
  const ct = normalizeTeamName(live.ctName)
  const t = normalizeTeamName(live.tName)
  const team1 = normalizeTeamName(team1Name)
  const team2 = normalizeTeamName(team2Name)

  let team1TotalRounds: number
  let team2TotalRounds: number
  if (team1 && ct === team1) {
    team1TotalRounds = live.ctScore
    team2TotalRounds = live.tScore
  } else if (team1 && t === team1) {
    team1TotalRounds = live.tScore
    team2TotalRounds = live.ctScore
  } else if (team2 && ct === team2) {
    team1TotalRounds = live.tScore
    team2TotalRounds = live.ctScore
  } else if (team2 && t === team2) {
    team1TotalRounds = live.ctScore
    team2TotalRounds = live.tScore
  } else {
    return maps
  }

  const liveName = String(live.mapName)
  const idx = maps.findIndex((m) => String(m.name) === liveName)
  if (idx < 0) return maps

  const current = maps[idx]
  const halfResults = current.result?.halfResults ?? [
    { team1Rounds: 0, team2Rounds: 0 },
    { team1Rounds: 0, team2Rounds: 0 }
  ]

  const next = maps.slice()
  next[idx] = {
    ...current,
    result: {
      team1TotalRounds,
      team2TotalRounds,
      halfResults
    }
  }
  return next
}

export const liveScoreboardFromScorebotBoard = (
  board: ScorebotSnapshotBoard | null | undefined
): LiveScoreboardSides | null => {
  if (!board) return null
  const ctScore = parseRoundNumber(String(board.counterTerroristScore))
  const tScore = parseRoundNumber(String(board.terroristScore))
  if (ctScore == null || tScore == null) return null

  const slug = String(board.mapName || '').trim()
  const fromSlug = (Object.values(GameMap) as string[]).includes(slug)
    ? (slug as GameMap)
    : undefined
  const pretty = slug.replace(/^de_/i, '')
  const titled = pretty ? pretty.charAt(0).toUpperCase() + pretty.slice(1) : ''
  const fromName = titled ? fromMapName(titled) : GameMap.Default
  const mapName =
    fromSlug || (fromName !== GameMap.Default ? fromName : undefined)
  if (!mapName || mapName === GameMap.Default) return null

  return {
    mapName,
    currentRoundText:
      board.currentRound != null
        ? `${board.currentRound} - ${String(mapName).replace(/^de_/i, '')}`
        : undefined,
    ctName: String(board.ctTeamName || 'Unknown').trim() || 'Unknown',
    tName: String(board.terroristTeamName || 'Unknown').trim() || 'Unknown',
    ctScore,
    tScore,
    ctIcon: '',
    tIcon: ''
  }
}

export const liveMatchScoreFromSides = (
  live: LiveScoreboardSides
): LiveMatchScoreExtract => ({
  score: {
    team1: {
      side: 'CT',
      name: live.ctName,
      score: String(live.ctScore),
      icon: live.ctIcon
    },
    team2: {
      side: 'T',
      name: live.tName,
      score: String(live.tScore),
      icon: live.tIcon
    }
  },
  map: String(live.mapName).replace(/^de_/i, '').toLowerCase()
})

export const extractLiveMatchScoreFromHtml = (
  html: string
): LiveMatchScoreExtract | null => {
  const live = readLiveScoreboardFromHtml(html)
  if (!isHydratedLiveScoreboard(live)) return null
  return liveMatchScoreFromSides(live)
}
