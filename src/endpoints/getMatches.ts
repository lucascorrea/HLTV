import { stringify } from 'querystring'
import { HLTVConfig } from '../config'
import { HLTVPage, HLTVPageElement, HLTVScraper } from '../scraper'
import { Team } from '../shared/Team'
import { Event } from '../shared/Event'
import { fetchPage, getIdAt } from '../utils'

export enum MatchEventType {
  All = 'All',
  LAN = 'Lan',
  Online = 'Online'
}

export enum MatchFilter {
  LanOnly = 'lan_only',
  TopTier = 'top_tier'
}

export interface GetMatchesArguments {
  eventIds?: number[]
  eventType?: MatchEventType
  filter?: MatchFilter
  teamIds?: number[]
}

export interface MatchPreview {
  id: number
  team1?: Team
  team2?: Team
  date?: number
  format?: string
  event?: Event
  title?: string
  live: boolean
  stars: number
}

/**
 * HLTV puts `team1` / `team2` on `.match-wrapper` (child), not on the zone/container
 * element that the list mapper iterates. Fall back to the element itself for older HTML.
 */
function teamIdFromListEl(el: HLTVPageElement, side: 1 | 2): number | undefined {
  const attr = `team${side}`
  return (
    el.find('.match-wrapper').numFromAttr(attr) ??
    el.numFromAttr(attr) ??
    el.find(`[${attr}]`).first().numFromAttr(attr)
  )
}

/** Live cards often omit `.matchTime`; unix may sit on `.match-time` or any `[data-unix]`. */
export function unixFromMatchListEl(el: HLTVPageElement): number | undefined {
  return (
    el.numFromAttr('data-unix') ??
    el.find('.matchTime').numFromAttr('data-unix') ??
    el.find('.match-time').numFromAttr('data-unix') ??
    el.find('[data-unix]').first().numFromAttr('data-unix')
  )
}

function teamLogoFromEl(el: HLTVPageElement, selector: string, index = 0): string {
  const node = el.find(selector).eq(index)
  const src = node.attr('src') || node.attr('data-cookieblock-src') || ''
  return !src.includes('placeholder.svg') ? src : ''
}

function liveTeamsFromEl(el: HLTVPageElement): { team1: Team; team2: Team } {
  const logo1 = teamLogoFromEl(el, '.match-team-logo:not(.day-only)', 0)
  const logo2 = teamLogoFromEl(el, '.match-team-logo:not(.day-only)', 1)
  return {
    team1: {
      name:
        el.find('.match-teamname').first().text() ||
        el.find('.team1 .team').text(),
      id: teamIdFromListEl(el, 1),
      logo: logo1
    },
    team2: {
      name:
        el.find('.match-teamname').eq(1).text() ||
        el.find('.team2 .team').text(),
      id: teamIdFromListEl(el, 2),
      logo: logo2
    }
  }
}

function upcomingTeamsFromEl(el: HLTVPageElement): { team1: Team; team2: Team } {
  const logo1 =
    el.find('.match-team.team1 .match-team-logo').length == 2
      ? teamLogoFromEl(el, '.match-team.team1 .match-team-logo', 1)
      : teamLogoFromEl(el, '.match-team.team1 .match-team-logo', 0)
  const logo2 =
    el.find('.match-team.team2 .match-team-logo').length == 2
      ? teamLogoFromEl(el, '.match-team.team2 .match-team-logo', 1)
      : teamLogoFromEl(el, '.match-team.team2 .match-team-logo', 0)
  return {
    team1: {
      name:
        el.find('.match-teamname').first().text() ||
        el.find('.team1 .team').text(),
      id: teamIdFromListEl(el, 1),
      logo: logo1
    },
    team2: {
      name:
        el.find('.match-teamname').eq(1).text() ||
        el.find('.team2 .team').text(),
      id: teamIdFromListEl(el, 2),
      logo: logo2
    }
  }
}

function dedupeMatchPreviews(matches: MatchPreview[]): MatchPreview[] {
  const seen = new Set<number>()
  const out: MatchPreview[] = []
  for (const match of matches) {
    if (match?.id == null || seen.has(match.id)) continue
    seen.add(match.id)
    out.push(match)
  }
  return out
}

export function parseMatchesListing($: HLTVPage): MatchPreview[] {
  const events = $('.match-event')
    .toArray()
    .map((el) => {
      return {
        id: el.attr('data-event-id') ? Number(el.attr('data-event-id')) : undefined,
        name: el.attr('data-event-headline')?.trim() || '',
        logo: el.find('.match-event-logo').attr('src') ||
              el.find('.match-event-logo').attr('data-cookieblock-src') || '',
      };
    });

  const liveMatches: MatchPreview[] = $('.matches-chronologically .live-matches-wrapper .liveMatches .live-match-container')
    .toArray()
    .map((el) => {
      const id = el.find('.a-reset').attrThen('href', getIdAt(2))!
      const stars = parseInt(el.attr('stars'), 10) || 0;
      const live = el.find('.match-meta-live').text().trim() === 'Live';
      const title = el.find('.match-event .text-ellipsis').text().trim() || undefined;
      const date = unixFromMatchListEl(el)
      const { team1, team2 } = liveTeamsFromEl(el)
      const format = el.find('.match-meta').last().text().trim();
      const eventName = el.find('.match-event').attr('data-event-headline') || '';
      const event = events.find((x) => x.name === eventName)

      return { id, date, stars, title, team1, team2, format, event, live }
    })

  // Do not require `.matches-chronologically-hide` — filter toggles that class
  // and would drop the upcoming list while live cards still parse.
  const upcomingMatches: MatchPreview[] = $('.matches-chronologically .matches-list .match-zone-wrapper')
    .toArray()
    .map((el) => {
      const id = el.find('.a-reset').attrThen('href', getIdAt(2))!
      const stars = parseInt(el.attr('stars'), 10) || 0;
      const live = el.find('.matchTime.matchLive').text() === 'LIVE'
      const title = el.find('.match-no-info').text() || undefined
      const date = unixFromMatchListEl(el)

      let team1
      let team2

      if (!title) {
        const teams = upcomingTeamsFromEl(el)
        team1 = teams.team1
        team2 = teams.team2
      }

      const format = el.find('.match-meta').last().text().trim();

      const eventName = el.find('.match-event').attr('data-event-headline') || '';
      const event = events.find((x) => x.name === eventName)

      return { id, date, stars, title, team1, team2, format, event, live }
    })

  return dedupeMatchPreviews(liveMatches.concat(upcomingMatches))
}

export const getMatches =
  (config: HLTVConfig) =>
    async ({
      eventIds,
      eventType,
      filter,
      teamIds
    }: GetMatchesArguments = {}): Promise<MatchPreview[]> => {
      const query = stringify({
        ...(eventIds ? { event: eventIds } : {}),
        ...(eventType ? { eventType } : {}),
        ...(filter ? { predefinedFilter: filter } : {}),
        ...(teamIds ? { team: teamIds } : {})
      })

      const $ = HLTVScraper(
        await fetchPage(
          `https://www.hltv.org/matches?${query}`,
          config.loadPage,
          config.loadPageFlareSolverr
        )
      )

      return parseMatchesListing($)
    }
