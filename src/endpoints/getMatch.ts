import { HLTVConfig } from '../config'
import { HLTVPage, HLTVPageElement, HLTVScraper } from '../scraper'
import { fromMapName, GameMap } from '../shared/GameMap'
import { Team } from '../shared/Team'
import { Event } from '../shared/Event'
import {
  fetchPage,
  generateRandomSuffix,
  getIdAt,
  parseNumber,
  percentageToDecimalOdd,
  toScrapeError
} from '../utils'
import { Player } from '../shared/Player'
import {
  fromFullMatchFormat,
  MatchFormat,
  MatchFormatLocation
} from '../shared/MatchFormat'
import { ResultMatch } from '../shared/ResultMatch'

export enum MatchStatus {
  Live = 'Live',
  Postponed = 'Postponed',
  Over = 'Over',
  Scheduled = 'Scheduled',
  Deleted = 'Deleted'
}

export interface Demo {
  name: string
  link: string
}

export interface Highlight {
  link: string
  title: string
}

export interface Veto {
  team?: Team
  map: GameMap
  type: 'removed' | 'picked' | 'leftover'
}

export interface HeadToHead {
  team1Win: number
  team2Win: number
  overtimes: number
  list: HeadToHeadResult[]
}
export interface HeadToHeadResult {
  date: number
  /** This property is undefined when the match resulted in a draw */
  winner?: Team
  event: Event
  map: GameMap
  result: string
}

export interface ProviderOdds {
  provider: string
  team1: number
  team2: number
}

export interface MapHalfResult {
  team1Rounds: number
  team2Rounds: number
}

export interface MapResult {
  name: GameMap
  result?: {
    team1TotalRounds: number
    team2TotalRounds: number
    halfResults: MapHalfResult[]
  }
  statsId?: number
}

export interface Stream {
  name: string
  link: string
  viewers: number
}

export interface FullMatchTeam extends Team {
  rank?: number
}

export interface FullMatch {
  id: number
  statsId?: number
  title?: string
  date?: number
  significance?: string
  format?: {
    type: MatchFormat
    location?: MatchFormatLocation
  }
  status: MatchStatus
  hasScorebot: boolean
  team1?: FullMatchTeam
  team2?: FullMatchTeam
  resultMatch: ResultMatch
  winnerTeam?: FullMatchTeam
  vetoes: Veto[]
  event: Event
  odds: ProviderOdds[]
  maps: MapResult[]
  players: {
    team1: Player[]
    team2: Player[]
  }
  streams: Stream[]
  demos: Demo[]
  highlightedPlayers?: {
    team1: Player
    team2: Player
  }
  headToHead: HeadToHead
  highlights: Highlight[]
  playerOfTheMatch?: Player
}

export const getMatch =
  (config: HLTVConfig) =>
  async ({ id }: { id: number }): Promise<FullMatch> => {
    const pageUrl = `https://www.hltv.org/matches/${id}/`
    const requestUrl = `${pageUrl}${generateRandomSuffix()}`
    let step = 'init'
    let htmlLength: number | undefined
    let $: ReturnType<typeof HLTVScraper> | undefined

    const domSnapshot = (): Record<string, boolean> | undefined => {
      if (!$) return undefined
      try {
        return {
          timeAndEvent: $('.timeAndEvent').exists(),
          team1gradient: $('.team1-gradient').exists(),
          team2gradient: $('.team2-gradient').exists(),
          scoreboardElement: $('#scoreboardElement').exists()
        }
      } catch {
        return undefined
      }
    }

    try {
      step = 'fetchPage'
      const root = await fetchPage(
        requestUrl,
        config.loadPage,
        config.loadPageFlareSolverr
      )
      htmlLength = root.html()?.length ?? 0

      step = 'HLTVScraper'
      $ = HLTVScraper(root)

      step = 'parse:metadata,teams,vetoes,event'
      const title = $('.timeAndEvent .text').trimText()
      const date = $('.timeAndEvent .date').numFromAttr('data-unix')
      const format = getFormat($)
      const significance = getMatchSignificance($)
      const status = getMatchStatus($)
      const hasScorebot = $('#scoreboardElement').exists()
      const statsId = getStatsId($)
      const team1 = getTeam($, 1)
      const team2 = getTeam($, 2)
      const vetoes = getVetoes($, team1, team2)
      const event = getEvent($)

      step = 'parse:odds,maps,players,streams,demos'
      const odds = getOdds($)
      const oddsCommunity = getCommunityOdds($)
      const maps = getMaps($)
      const players = getPlayers($)
      const streams = getStreams($)
      const demos = getDemos($)
      const highlightedPlayers = getHighlightedPlayers($)

      step = 'parse:headToHead,highlights,potm,winner'
      const headToHead = getHeadToHead($)
      const highlights = getHighlights($, team1, team2)
      const playerOfTheMatch = getPlayerOfTheMatch($, players)
      const winnerTeam = getWinnerTeam($, team1, team2)
      const resultMatch = countMapWins(maps)

      return {
        id,
        statsId,
        significance,
        team1,
        team2,
        resultMatch,
        winnerTeam,
        date,
        format,
        event,
        maps,
        players,
        streams,
        status,
        title,
        hasScorebot,
        highlightedPlayers,
        playerOfTheMatch,
        headToHead,
        vetoes,
        highlights,
        demos,
        odds: odds.concat(oddsCommunity ? [oddsCommunity] : [])
      }
    } catch (err) {
      throw toScrapeError(err, {
        endpoint: 'getMatch',
        matchId: id,
        pageUrl,
        step,
        expected: 'HTML matching current HLTV match page selectors (see step)',
        got:
          step === 'fetchPage'
            ? 'fetch failed before cheerio root'
            : `serialized DOM length≈${htmlLength}`,
        hint:
          'If step is past fetchPage, open pageUrl in a browser and diff .timeAndEvent / maps / head-to-head markup.',
        extra: { requestUrl, dom: domSnapshot() }
      })
    }
  }

function getMatchStatus($: HLTVPage): MatchStatus {
  let status = MatchStatus.Scheduled

  switch ($('.countdown').trimText()) {
    case 'LIVE':
      status = MatchStatus.Live
      break
    case 'Match postponed':
      status = MatchStatus.Postponed
      break
    case 'Match deleted':
      status = MatchStatus.Deleted
      break
    case 'Match over':
      status = MatchStatus.Over
      break
  }

  return status
}

function teamFromHrefAndName(
  link: HLTVPageElement,
  logoEl?: HLTVPageElement,
  rank?: number
): FullMatchTeam | undefined {
  if (!link.exists()) return undefined
  const href = link.attr('href')
  const id = href ? getIdAt(2, href) : undefined
  const name = link.trimText() || link.text().trim()
  if (!name) return undefined
  const logoRoot = logoEl && logoEl.exists() ? logoEl : link.parent()
  const logo =
    logoRoot.find('img.night-only').attr('src') ||
    logoRoot.find('img.night-only').attr('data-cookieblock-src') ||
    logoRoot.find('img:not(.day-only)').first().attr('src') ||
    logoRoot.find('img:not(.day-only)').first().attr('data-cookieblock-src')
  return { name, id, logo, rank }
}

/**
 * Rank must come from each lineup's `.teamRanking`, not global `.teamRanking a`.
 * Unranked teams have no `<a>` (only "Unranked" text), so a single ranked team
 * would otherwise become `.eq(0)` for both parsers and shift ranks to team1.
 */
function getWorldRankFromMatchLineups($: HLTVPage, n: 1 | 2): number | undefined {
  const box = $('#lineups .lineup').eq(n - 1)
  if (!box.exists()) {
    const legacy = $('.teamRanking a').eq(n - 1)
    if (!legacy.exists()) return undefined
    const fromText = legacy.text().match(/#(\d+)/)
    if (fromText) return parseNumber(fromText[1])
    return legacy
      .contents()
      .eq(1)
      .textThen((x) => parseNumber(x.replace(/#/g, '')))
  }
  const ranking = box.find('.teamRanking').first()
  if (!ranking.exists()) return undefined
  const link = ranking.find('a[href*="/ranking/"]').first()
  if (link.exists()) {
    const fromText = link.text().match(/#(\d+)/)
    if (fromText) return parseNumber(fromText[1])
    return link
      .contents()
      .eq(1)
      .textThen((x) => parseNumber(x.replace(/#/g, '')))
  }
  if (/unranked/i.test(ranking.text())) return undefined
  return undefined
}

/** Clássico: `.team1-gradient` / `.team2-gradient` */
function getTeamFromGradient($: HLTVPage, n: 1 | 2): FullMatchTeam | undefined {
  const root = $(`.team${n}-gradient`)
  if (!root.exists()) return undefined
  const link = root.find('a[href*="/team/"]').first()
  const rank = getWorldRankFromMatchLineups($, n)
  const t = teamFromHrefAndName(link, root, rank)
  if (t) return t
  const name = root.find('.teamName').text().trim()
  if (!name) return undefined
  return {
    name,
    id: root.find('a').attrThen('href', (h) => (h ? getIdAt(2, h) : undefined)),
    logo:
      root.find('img.night-only').attr('src') ||
      root.find('img.night-only').attr('data-cookieblock-src') ||
      root.find('img:not(.day-only)').first().attr('src') ||
      root.find('img:not(.day-only)').first().attr('data-cookieblock-src'),
    rank
  }
}

/** Listagens / header: `.match-team.team1` (getMatches) */
function getTeamFromMatchTeamRow($: HLTVPage, n: 1 | 2): FullMatchTeam | undefined {
  const row = $(`.match-team.team${n}`)
  if (!row.exists()) return undefined
  const link = row.find('a[href*="/team/"]').first()
  const idAttr = row.numFromAttr(`team${n}`)
  const rank = getWorldRankFromMatchLineups($, n)
  if (link.exists()) {
    const t = teamFromHrefAndName(link, row, rank)
    if (t) return t
  }
  const name =
    row.find('.match-team-name').first().trimText() ||
    row.find('.team').first().trimText() ||
    row.find('.text-ellipsis').first().trimText()
  if (!name && idAttr == null) return undefined
  const logo =
    row.find('.match-team-logo').first().attr('src') ||
    row.find('.match-team-logo').first().attr('data-cookieblock-src') ||
    row.find('img').first().attr('src') ||
    row.find('img').first().attr('data-cookieblock-src')
  return {
    name: name || `Team ${idAttr}`,
    id: idAttr ?? link.attrThen('href', (h) => (h ? getIdAt(2, h) : undefined)),
    logo,
    rank
  }
}

/** Caixa "pick a winner" */
function getTeamFromPickWinner($: HLTVPage, n: 1 | 2): FullMatchTeam | undefined {
  const box = $(`.pick-a-winner-team.team${n}`)
  if (!box.exists()) return undefined
  const link = box.find('a[href*="/team/"]').first()
  const rank = getWorldRankFromMatchLineups($, n)
  return teamFromHrefAndName(link, box, rank)
}

/** Primeira linha de odds: células com link para equipa */
function getTeamFromProviderOdds($: HLTVPage, n: 1 | 2): FullMatchTeam | undefined {
  const row = $('tr.provider:not(.hidden)').first()
  if (!row.exists()) return undefined
  const cell =
    n === 1 ? row.find('.odds-cell').first() : row.find('.odds-cell').last()
  const link = cell.find('a[href*="/team/"]').first()
  const rank = getWorldRankFromMatchLineups($, n)
  return teamFromHrefAndName(link, cell, rank)
}

function getTeam($: HLTVPage, n: 1 | 2): FullMatchTeam | undefined {
  const candidates = [
    getTeamFromGradient($, n),
    getTeamFromMatchTeamRow($, n),
    getTeamFromPickWinner($, n),
    getTeamFromProviderOdds($, n)
  ]
  for (const t of candidates) {
    if (t?.name && t.id != null) return t
  }
  for (const t of candidates) {
    if (t?.name) return t
  }
  return undefined
}

function getVetoes($: HLTVPage, team1?: Team, team2?: Team): Veto[] {
  const getVeto = (text: string) => {
    const [teamName, map] = text.replace(/^\d. /, '').split(/removed|picked/)

    if (!map || !teamName) {
      return {
        map: fromMapName(text.split(' ')[1]),
        type: 'leftover'
      } as const
    }

    return {
      team: [team1, team2].find((t) => t!.name === teamName.trim())!,
      map: fromMapName(map.trim()),
      type: text?.includes('picked') ? 'picked' : 'removed'
    } as const
  }

  if (!team1 || !team2) {
    return []
  }

  // New format
  if ($('.veto-box').length > 1) {
    return $('.veto-box')
      .last()
      .find('.padding div')
      .toArray()
      .map((el) => getVeto(el.text()))
  }

  //Old format
  if ($('.veto-box').first().exists()) {
    const lines = $('.veto-box').first().lines()
    const vetoIndex = lines.findIndex((x) => x?.includes('Veto process'))

    if (vetoIndex !== -1) {
      return lines.slice(vetoIndex + 2, lines.length - 1).map(getVeto)
    }
  }

  return []
}

function getEvent($: HLTVPage): Event {
  let link = $('.timeAndEvent .event a').first()
  if (!link.exists()) {
    link = $('.timeAndEvent a[href*="/events/"]').first()
  }
  const href = link.attr('href')
  if (!href) {
    link = $('.timeAndEvent a[href*="/events/"]').first()
  }
  return {
    name: link.exists() ? link.text().trim() : $('.timeAndEvent .event').text().trim(),
    id: link.attrThen('href', (h) => (h ? getIdAt(2, h) : undefined)),
  }
}

function getOdds($: HLTVPage): ProviderOdds[] {
  return $('tr.provider:not(.hidden)')
    .toArray()
    .filter((el) => el.find('.noOdds').length === 0)
    .map((oddElement) => {
      const convertOdds =
        oddElement.find('.odds-cell').first().text().indexOf('%') >= 0

      const oddTeam1 = Number(
        oddElement.find('.odds-cell').first().find('a').text().replace('%', '')
      )

      const oddTeam2 = Number(
        oddElement.find('.odds-cell').last().find('a').text().replace('%', '')
      )

      return {
        provider: oddElement
          .find('td')
          .first()
          .find('a img')
          .first()
          .attr('title'),
        team1: convertOdds ? percentageToDecimalOdd(oddTeam1) : oddTeam1,
        team2: convertOdds ? percentageToDecimalOdd(oddTeam2) : oddTeam2
      }
    })
}

function getCommunityOdds($: HLTVPage): ProviderOdds | undefined {
  if ($('.pick-a-winner').exists()) {
    return {
      provider: 'community',
      team1: percentageToDecimalOdd(
        Number(
          $('.pick-a-winner-team.team1 > .percentage')
            .first()
            .text()
            .replace('%', '')
        )
      ),
      team2: percentageToDecimalOdd(
        Number(
          $('.pick-a-winner-team.team2 > .percentage')
            .first()
            .text()
            .replace('%', '')
        )
      )
    }
  }
}

function countMapWins(maps: MapResult[]): { team1Win: number; team2Win: number } {
  return maps.reduce(
    (acc, map) => {
      if (map.result) {
        const team1Rounds = map.result.team1TotalRounds;
        const team2Rounds = map.result.team2TotalRounds;

        // Verifica se é uma vitória válida baseada nas regras do CS
        const isTeam1Winner = (team1Rounds >= 13 && team1Rounds >= team2Rounds + 2) || 
                            (team1Rounds > team2Rounds && team1Rounds >= 16);
        const isTeam2Winner = (team2Rounds >= 13 && team2Rounds >= team1Rounds + 2) || 
                            (team2Rounds > team1Rounds && team2Rounds >= 16);

        if (isTeam1Winner) {
          acc.team1Win += 1;
        } else if (isTeam2Winner) {
          acc.team2Win += 1;
        }
      }
      return acc;
    },
    { team1Win: 0, team2Win: 0 }
  );
}

function getMaps($: HLTVPage): MapResult[] {
  return $('.mapholder')
    .toArray()
    .map((mapEl) => {
      const team1TotalRounds = Number(
        mapEl.find('.results-left .results-team-score').trimText()
      )

      const team2TotalRounds = Number(
        mapEl.find('.results-right .results-team-score').trimText()
      )

      const statsId = mapEl.find('.results-stats').exists()
        ? mapEl
            .find('.results-stats')
            .attrThen('href', (x) => Number(x.split('/')[4]))
        : undefined

      let result

      if (!isNaN(team1TotalRounds) && !isNaN(team2TotalRounds)) {
        const halfsString = mapEl.find('.results-center-half-score').trimText()!
        let halfs = [
          { team1Rounds: 0, team2Rounds: 0 },
          { team1Rounds: 0, team2Rounds: 0 }
        ]
        if (halfsString) {
          halfs = halfsString
            .split(' ')
            .map((x) => x.replace(/\(|\)|;/g, ''))
            .map((half) => ({
              team1Rounds: Number(half.split(':')[0]),
              team2Rounds: Number(half.split(':')[1])
            }))
        }

        result = {
          team1TotalRounds,
          team2TotalRounds,
          halfResults: halfs
        }
      }

      return {
        name: fromMapName(mapEl.find('.mapname').text()),
        result,
        statsId
      }
    })
}

function getPlayers($: HLTVPage) {
  const getTeamPlayers = (teamDiv: HLTVPageElement) => {
    const trs = teamDiv.find('tr');
    const imagesRow = trs.first();
    const dataRow = trs.last();

    return dataRow
      .find('.flagAlign')
      .toArray()
      .map((playerEl, i) => {
        // Tentar obter a foto do jogador de várias maneiras
        let photoUrl = '';
        
        // Método 1: Verificar a estrutura atual
        const photoEl = imagesRow.children().eq(i).find('img');
        if (photoEl.length) {
          photoUrl = photoEl.attr('src') || photoEl.attr('data-cookieblock-src') || '';
        }
        
        // Método 2: Verificar se existe um elemento player-compare com o mesmo ID
        if (!photoUrl) {
          const playerId = playerEl.data('player-id');
          if (playerId) {
            const playerCompareEl = $(`.player-compare[data-player-id="${playerId}"] img`);
            if (playerCompareEl.length) {
              photoUrl = playerCompareEl.attr('src') || playerCompareEl.attr('data-cookieblock-src') || '';
            }
          }
        }
        
        // Método 3: Verificar se existe um elemento com a classe player-photo
        if (!photoUrl) {
          const playerName = playerEl.find('.text-ellipsis').text();
          if (playerName) {
            const playerPhotoEl = $(`img.player-photo[title*="${playerName}"]`);
            if (playerPhotoEl.length) {
              photoUrl = playerPhotoEl.attr('src') || playerPhotoEl.attr('data-cookieblock-src') || '';
            }
          }
        }
        
        return {
          photo: photoUrl,
          name: playerEl.find('.text-ellipsis').text(),
          id: playerEl.data('player-id')
        }
      });
  }

  return {
    team1: getTeamPlayers($('div.players').first()),
    team2: getTeamPlayers($('div.players').eq(1))
  }
}

function getStreams($: HLTVPage): Stream[] {
  return $('.stream-box')
    .toArray()
    .filter((el) => el.find('.stream-flag').exists())
    .map((streamEl) => ({
      name: streamEl.find('.stream-box-embed').text() || 'VOD',
      link:
        streamEl.data('stream-embed') ||
        streamEl.find('.stream-box-embed').attr('data-stream-embed'),
      viewers: streamEl.find('.viewers.gtSmartphone-only').numFromText() ?? -1
    }))
    .concat(
      $('.stream-box.hltv-live').exists()
        ? [
            {
              name: 'HLTV Live',
              link: $('.stream-box.hltv-live a').attr('href'),
              viewers: -1
            }
          ]
        : []
    )
    .concat(
      $('[data-demo-link-button]').exists()
        ? [
            {
              name: 'GOTV',
              link: `https://www.hltv.org${$('[data-demo-link-button]').data(
                'demo-link'
              )}`,
              viewers: -1
            }
          ]
        : []
    )
}

function getDemos($: HLTVPage): Demo[] {
  return $('[class="stream-box"]:not(:has(.stream-box-embed))')
    .toArray()
    .map(function (demoEl) {
      if (demoEl.attr('data-demo-link')) {
        return { name: 'GOTV Demo', link: demoEl.attr('data-demo-link') }
      }

      return {
        name: demoEl.text(),
        link: demoEl.attr('data-stream-embed')
      }
    })
    .filter((x) => !!x.link)
}

function getHighlightedPlayers($: HLTVPage) {
  const highlightedPlayer1 = $(
    '.lineups-compare-left .lineups-compare-player-links a'
  ).first()

  const highlightedPlayer2 = $(
    '.lineups-compare-right .lineups-compare-player-links a'
  ).first()

  return highlightedPlayer1.exists() && highlightedPlayer2.exists()
    ? {
        team1: {
          photo: $('.lineups-compare-left .player-photo').attr('src') || 
                 $('.lineups-compare-left .player-photo').attr('data-cookieblock-src') || '',
          name: $('.lineups-compare-left .lineups-compare-playername').text(),
          id: $('.lineups-compare-left .lineups-compare-player-links a')
            .first()
            .attrThen('href', getIdAt(2))
        },
        team2: {
          photo: $('.lineups-compare-right .player-photo').attr('src') || 
                 $('.lineups-compare-right .player-photo').attr('data-cookieblock-src') || '',
          name: $('.lineups-compare-right .lineups-compare-playername').text(),
          id: $('.lineups-compare-right .lineups-compare-player-links a')
            .first()
            .attrThen('href', getIdAt(2))
        }
      }
    : undefined
}

function getHeadToHead($: HLTVPage): HeadToHead {
  const headToHead = $('.head-to-head-listing tr')
    .toArray()
    .map((matchEl) => {
      const date = Number(matchEl.find('.date a span').attr('data-unix'))
      const map = matchEl.find('.dynamic-map-name-short').text() as GameMap
      const isDraw = !matchEl.find('.winner').exists()

      let winner: Team | undefined

      if (!isDraw) {
        winner = {
          name: matchEl.find('.winner .flag').next().text(),
          id: matchEl.find('.winner .flag').next().attrThen('href', getIdAt(2))
        }
      }

      const event = {
        name: matchEl.find('.event a').text(),
        id: matchEl.find('.event a').attrThen('href', getIdAt(2))
      }

      const result = matchEl.find('.result').text()

      return { date, map, winner, event, result }
    })

  // Extrair informações do head-to-head box
  const headToHeadBox = $('.head-to-head .standard-box');
  
  return {
    team1Win: headToHeadBox.find('.right-border .bold').numFromText() ?? 0,
    team2Win: headToHeadBox.find('.left-border .bold').numFromText() ?? 0,
    overtimes: headToHeadBox.find('.flexbox-column:nth-child(3) .bold').numFromText() ?? 0,
    list: headToHead
  }
}

function getHighlights($: HLTVPage, team1?: Team, team2?: Team): Highlight[] {
  return team1 && team2
    ? $('.highlight')
        .toArray()
        .map((highlightEl) => ({
          link: highlightEl.attr('data-highlight-embed'),
          title: highlightEl.text()
        }))
    : []
}

function getStatsId($: HLTVPage): number | undefined {
  const statsEl = $('.stats-detailed-stats a')

  if (statsEl.exists() && !statsEl.attr('href')?.includes('mapstats')) {
    return getIdAt(3, $('.stats-detailed-stats a').attr('href'))
  }
}

function getPlayerOfTheMatch(
  $: HLTVPage,
  players: Record<string, Player[]>
): Player | undefined {
  const playerName: string | undefined = $(
    '.highlighted-player .player-nick'
  ).text()

  if (playerName) {
    return (
      players.team1.find((x) => x.name === playerName) ||
      players.team2.find((x) => x.name === playerName)
    )
  }
}

function getWinnerTeam(
  $: HLTVPage,
  team1?: Team,
  team2?: Team
): Team | undefined {
  if ($('.team1-gradient .won').exists()) {
    return team1
  }

  if ($('.team2-gradient .won').exists()) {
    return team2
  }

  if ($('.match-team.team1 .won').exists()) {
    return team1
  }
  if ($('.match-team.team2 .won').exists()) {
    return team2
  }
}

function getFormat($: HLTVPage) {
  if (!$('.preformatted-text').exists()) {
    return
  }

  const [format, location] = $('.preformatted-text')
    .lines()[0]
    .split(' (')
    .map((x) => x.trim())

  return {
    type: fromFullMatchFormat(format),
    location: location?.substring(0, location.length - 1) as MatchFormatLocation
  }
}

function getMatchSignificance($: HLTVPage) {
  const additionalInfo = $('.preformatted-text').lines()
  return additionalInfo
    .find((x) => x.startsWith('*'))
    ?.slice(1)
    .trim()
}
