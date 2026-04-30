import { stringify } from 'querystring'
import { HLTVConfig } from '../config'
import { HLTVPage, HLTVPageElement, HLTVScraper } from '../scraper'
import { BestOfFilter } from '../shared/BestOfFilter'
import { fromMapName, GameMap, toMapFilter } from '../shared/GameMap'
import { MatchType } from '../shared/MatchType'
import { Player } from '../shared/Player'
import { Event } from '../shared/Event'
import { RankingFilter } from '../shared/RankingFilter'
import { fetchPageFlareSolverr, getIdAt, parseNumber } from '../utils'
import { MatchStatsPreview } from './getMatchesStats'

export interface TeamMapStats {
  wins: number
  draws: number
  losses: number
  winRate: number
  totalRounds: number
  roundWinPAfterFirstKill: number
  roundWinPAfterFirstDeath: number
}

export interface TeamStatsEvent {
  place: string
  event: Event
}

export interface FullTeamStats {
  id: number
  name: string
  overview: {
    mapsPlayed: number
    wins: number
    draws: number
    losses: number
    totalKills: number
    totalDeaths: number
    roundsPlayed: number
    kdRatio: number
  }
  currentLineup: Player[]
  historicPlayers: Player[]
  standins: Player[]
  substitutes: Player[]
  matches: MatchStatsPreview[]
  mapStats: Record<GameMap, TeamMapStats>
  events: TeamStatsEvent[]
}

export interface GetTeamStatsArguments {
  id: number
  currentRosterOnly?: boolean
  /** Performance toggle: events page is heavy and usually unused downstream. */
  includeEvents?: boolean
  startDate?: string
  endDate?: string
  matchType?: MatchType
  rankingFilter?: RankingFilter
  maps?: GameMap[]
  bestOfX?: BestOfFilter
}

export const getTeamStats =
  (config: HLTVConfig) =>
  async (options: GetTeamStatsArguments): Promise<FullTeamStats> => {
    const query = stringify({
      ...(options.startDate ? { startDate: options.startDate } : {}),
      ...(options.endDate ? { endDate: options.endDate } : {}),
      ...(options.matchType ? { matchType: options.matchType } : {}),
      ...(options.rankingFilter
        ? { rankingFilter: options.rankingFilter }
        : {}),
      ...(options.maps ? { maps: options.maps.map(toMapFilter) } : {}),
      ...(options.bestOfX ? { bestOfX: options.bestOfX } : {})
    })
    const includeEvents = options.includeEvents !== false

    const loadStats = config.loadPageFlareSolverr ?? config.loadPage

    let $ = HLTVScraper(
      await fetchPageFlareSolverr(
        `https://www.hltv.org/stats/teams/${options.id}/-?${query}`,
        loadStats
      )
    )

    const name = $('.context-item-name').last().text()
    const currentTeam = { photo: '', id: options.id, name }
    const teamSlug = toTeamSlug(name) || '-'

    const currentLineup = getPlayersByContainer(
      getContainerByText($, 'Current lineup')
    )

    const currentRosterQuery = stringify({
      lineup: currentLineup.map((x) => x.id!),
      minLineupMatch: 0
    })

    if (options.currentRosterOnly) {
      $ = HLTVScraper(
        await fetchPageFlareSolverr(
          `https://www.hltv.org/stats/lineup?${currentRosterQuery}`,
          loadStats
        )
      )
    }

    const historicPlayers = getPlayersByContainer(
      getContainerByText($, 'Historic players')
    )

    const substitutes = getPlayersByContainer(
      getContainerByText($, 'Substitutes')
    )

    const standins = getPlayersByContainer(getContainerByText($, 'Standins'))

    const matchesUrl = options.currentRosterOnly
      ? `https://www.hltv.org/stats/lineup/matches?${currentRosterQuery}&${query}`
      : `https://www.hltv.org/stats/teams/matches/${options.id}/${teamSlug}?${query}`
    const eventsUrl = options.currentRosterOnly
      ? `https://www.hltv.org/stats/lineup/events?${currentRosterQuery}&${query}`
      : `https://www.hltv.org/stats/teams/events/${options.id}/${teamSlug}?${query}`
    const mapsUrl = options.currentRosterOnly
      ? `https://www.hltv.org/stats/lineup/maps?${currentRosterQuery}&${query}`
      : `https://www.hltv.org/stats/teams/maps/${options.id}/${teamSlug}?${query}`

    // Keep matches sequential for parser stability; load events/maps in parallel for speed.
    const m$ = HLTVScraper(await fetchPageFlareSolverr(matchesUrl, loadStats))
    let e$: HLTVPage | null = null
    let mp$ = HLTVScraper(await fetchPageFlareSolverr(mapsUrl, loadStats))
    if (includeEvents) {
      e$ = HLTVScraper(await fetchPageFlareSolverr(eventsUrl, loadStats))
      if (e$('.stats-table tbody tr').length === 0) {
        e$ = HLTVScraper(await fetchPageFlareSolverr(eventsUrl, loadStats))
      }
    }
    if (mp$('.two-grid .col .stats-rows').length === 0) {
      mp$ = HLTVScraper(await fetchPageFlareSolverr(mapsUrl, loadStats))
    }

    const overview = mergeTeamOverviewFromStatsRows($, readLegacyLargeStrongOverview($))

    const matches = m$('.stats-table tbody tr')
      .toArray()
      .map((el) => {
        const dateLink = el.find('.time a')
        const fallbackDate = el.find('td').first().find('a')
        const mapCell = el.find('.statsMapPlayed')
        const fallbackMapCell = el.find('td').eq(4)
        const opponentLink = el.find('img.flag').parent()
        const fallbackOpponentLink = el.find('td').eq(3).find('a')
        const mapHref =
          dateLink.attr('href') || fallbackDate.attr('href') || ''
        const statsDetailText = el.find('.statsDetail').text();
        const [team1Result, team2Result] = statsDetailText ? statsDetailText.split(' - ').map(Number) : [0, 0];

        return {
          date: getTimestamp(dateLink.text() || fallbackDate.text()),
          event: {
            id: Number(
              el
                .find('.image-and-label')
                .attr('href')!
                ?.split('event=')[1]
                ?.split('&')[0]
            ),
            name: el.find('.image-and-label img').attr('title')!
          },
          team1: currentTeam,
          team2: {
            id: (opponentLink.attrThen('href', getIdAt(3)) ??
              fallbackOpponentLink.attrThen('href', getIdAt(3)))!,
            name: opponentLink.trimText() || fallbackOpponentLink.trimText()!
          },
          map: fromMapName(mapCell.text() || fallbackMapCell.text()),
          mapStatsId: getIdAt(4, mapHref)!,
          result: { team1: Number(team1Result), team2: Number(team2Result) }
        }
      })

    const events = includeEvents && e$
      ? e$('.stats-table tbody tr')
          .toArray()
          .map((el) => {
            const eventEl = el.find('.image-and-label').first()

            return {
              place: el.find('.statsCenterText').text(),
              event: {
                id: Number(eventEl.attr('href')!?.split('event=')[1]?.split('&')[0]),
                name: eventEl.text()
              }
            }
          })
      : []

    const getMapStat = (mapEl: HLTVPageElement, i: number) =>
      mapEl.find('.stats-row').eq(i).children().last().text()

    const mapStats = mp$('.two-grid .col .stats-rows')
      .toArray()
      .reduce((stats, mapEl) => {
        const mapName = fromMapName(
          mapEl.prev().find('.map-pool-map-name').text()
        )

        const mapStatText = getMapStat(mapEl, 0);
        const [wins, draws, losses] = mapStatText ? mapStatText.split(' / ').map(Number) : [0, 0, 0];

        stats[mapName] = {
          wins,
          draws,
          losses,
          winRate: Number(getMapStat(mapEl, 1)?.split('%')[0]),
          totalRounds: Number(getMapStat(mapEl, 2)),
          roundWinPAfterFirstKill: Number(getMapStat(mapEl, 3)?.split('%')[0]),
          roundWinPAfterFirstDeath: Number(getMapStat(mapEl, 4)?.split('%')[0])
        }

        return stats
      }, {} as Record<string, any>)

    return {
      id: options.id,
      name,
      overview,
      matches,
      currentLineup,
      historicPlayers,
      standins,
      substitutes,
      events,
      mapStats
    }
  }

function getContainerByText($: HLTVPage, text: string) {
  return $('.standard-headline')
    .filter((_, el) => el.text() === text)
    .parent()
    .next()
}

/** HLTV team stats page often uses `.stats-row` label + value (same pattern as player stats). */
function getTeamOverviewStatByLabel($: HLTVPage, labelIncludes: string): number | undefined {
  const lbl = labelIncludes.toLowerCase()
  const row = $('.stats-row').filter((_, x) =>
    x?.text()?.toLowerCase()?.includes(lbl)
  )
  if (!row.exists()) return undefined
  const raw = row
    .find('span')
    .eq(1)
    .text()
    .replace(/%/g, '')
    .replace(/,/g, '')
    .trim()
  return parseNumber(raw)
}

function getTeamWDLFromStatsRows($: HLTVPage): { wins: number; draws: number; losses: number } | undefined {
  const row = $('.stats-row').filter((_, x) => {
    const t = x?.text()?.toLowerCase() ?? ''
    return t.includes('draw') && t.includes('loss')
  })
  if (!row.exists()) return undefined
  const val = row.find('span').eq(1).text()
  const parts = val
    .split(/\s*\/\s*/)
    .map((p) => parseNumber(p.replace(/,/g, '').trim()))
    .filter((n): n is number => n !== undefined && !Number.isNaN(n))
  if (parts.length >= 3) {
    return { wins: parts[0], draws: parts[1], losses: parts[2] }
  }
  return undefined
}

function readLegacyLargeStrongOverview($: HLTVPage): FullTeamStats['overview'] {
  const overviewStats = $('.standard-box .large-strong')
  const overviewText = overviewStats.eq(1).text()
  const [wins, draws, losses] = overviewText
    ? overviewText.split('/').map((s) => parseNumber(s.trim()) ?? 0)
    : [0, 0, 0]

  return {
    mapsPlayed: overviewStats.eq(0).numFromText() ?? 0,
    totalKills: overviewStats.eq(2).numFromText() ?? 0,
    totalDeaths: overviewStats.eq(3).numFromText() ?? 0,
    roundsPlayed: overviewStats.eq(4).numFromText() ?? 0,
    kdRatio: overviewStats.eq(5).numFromText() ?? 0,
    wins: wins ?? 0,
    draws: draws ?? 0,
    losses: losses ?? 0
  }
}

function mergeTeamOverviewFromStatsRows(
  $: HLTVPage,
  legacy: FullTeamStats['overview']
): FullTeamStats['overview'] {
  const rowMaps = getTeamOverviewStatByLabel($, 'maps played')
  const rowKills = getTeamOverviewStatByLabel($, 'total kills')
  const rowDeaths = getTeamOverviewStatByLabel($, 'total deaths')
  const rowRounds = getTeamOverviewStatByLabel($, 'rounds played')
  const wdl = getTeamWDLFromStatsRows($)

  const pick = (fromRow: number | undefined, fromLegacy: number) =>
    fromRow !== undefined && fromRow > 0 ? fromRow : fromLegacy

  const wins = wdl && (wdl.wins > 0 || wdl.draws > 0 || wdl.losses > 0) ? wdl.wins : legacy.wins
  const draws = wdl && (wdl.wins > 0 || wdl.draws > 0 || wdl.losses > 0) ? wdl.draws : legacy.draws
  const losses = wdl && (wdl.wins > 0 || wdl.draws > 0 || wdl.losses > 0) ? wdl.losses : legacy.losses

  const totalKills = pick(rowKills, legacy.totalKills)
  const totalDeaths = pick(rowDeaths, legacy.totalDeaths)
  const mapsPlayed = pick(rowMaps, legacy.mapsPlayed)
  const roundsPlayed = pick(rowRounds, legacy.roundsPlayed)

  let kd =
    getTeamOverviewStatByLabel($, 'k/d ratio') ?? getTeamOverviewStatByLabel($, 'k/d')
  if (kd === undefined || kd <= 0 || Number.isNaN(kd)) {
    if (totalKills > 0 && totalDeaths > 0) {
      kd = totalKills / totalDeaths
    } else {
      kd = legacy.kdRatio > 0 ? legacy.kdRatio : 0
    }
  }

  return {
    mapsPlayed,
    totalKills,
    totalDeaths,
    roundsPlayed,
    kdRatio: kd,
    wins,
    draws,
    losses
  }
}

function getPlayersByContainer(container: HLTVPageElement) {
  return container
    .find('.image-and-label')
    .toArray()
    .map((el) => ({
      photo: '',
      id: el.attrThen('href', getIdAt(3)),
      name: el.find('.text-ellipsis').text()
    }))
}

function getTimestamp(source: string): number {
  const [day, month, year] = source?.split('/') ?? [];

  return new Date([month, day, year].join('/')).getTime()
}

function toTeamSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

