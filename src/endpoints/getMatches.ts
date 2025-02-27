import { stringify } from 'querystring'
import { HLTVConfig } from '../config'
import { HLTVScraper } from '../scraper'
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
        await fetchPage(`https://www.hltv.org/matches?${query}`, config.loadPage)
      )

      const events = $('.match-event')
        .toArray()
        .map((el) => {
          return {
            id: el.attr('data-event-id') ? Number(el.attr('data-event-id')) : undefined,
            name: el.attr('data-event-headline')?.trim() || '',
            logo: el.find('.match-event-logo').attr('src') || '',
          };
        });

      const liveMatches = $('.matches-chronologically.matches-chronologically-hide .live-matches-wrapper .liveMatches .live-match-container')
        .toArray()
        .map((el) => {
          const id = el.find('.a-reset').attrThen('href', getIdAt(2))!
          const stars = parseInt(el.attr('stars'), 10) || 0;
          const live = el.find('.match-meta-live').text().trim() === 'Live';
          const title = el.find('.match-event .text-ellipsis').text().trim() || undefined;
          const date = el.find('.matchTime').numFromAttr('data-unix')

          let team1
          let team2

          if (title) {
            var logo1 = ''
            var logo2 = ''

            const logoSrc1 = el.find('.match-team-logo:not(.day-only)').first().attr('src') || '';
            logo1 = !logoSrc1?.includes('placeholder.svg') ? logoSrc1 : '';
            const logoSrc2 = el.find('.match-team-logo:not(.day-only)').eq(1).attr('src') || '';
            logo2 = !logoSrc2?.includes('placeholder.svg') ? logoSrc2 : '';

            team1 = {
              name:
                el.find('.match-teamname').first().text() ||
                el.find('.team1 .team').text(),
              id: el.numFromAttr('team1'),
              logo: logo1
            }

            team2 = {
              name:
                el.find('.match-teamname').eq(1).text() ||
                el.find('.team2 .team').text(),
              id: el.numFromAttr('team2'),
              logo: logo2
            }
          }

          const format = el.find('.match-meta').last().text().trim();
          const eventName = el.find('.match-event').attr('data-event-headline') || '';
          const event = events.find((x) => x.name === eventName)

          return { id, date, stars, title, team1, team2, format, event, live }
        })

      const upcomingMatches = $('.matches-chronologically.matches-chronologically-hide .matches-list .match-time-wrapper')
        .toArray()
        .map((el) => {
          const id = el.find('.a-reset').attrThen('href', getIdAt(2))!
          const stars = parseInt(el.attr('stars'), 10) || 0;
          const live = el.find('.matchTime.matchLive').text() === 'LIVE'
          const title = el.find('.match-no-info').text() || undefined
          const date = el.find('.match-time').numFromAttr('data-unix')
          
          let team1
          let team2

          if (!title) {
            var logo1 = ''
            var logo2 = ''
          
            if (el.find('.match-team.team1 .match-team-logo').length == 2) {
              const logoSrc1 = el.find('.match-team.team1 .match-team-logo').eq(1).attr('src') || '';
              logo1 = !logoSrc1?.includes('placeholder.svg') ? logoSrc1 : '';
            } else {
              const logoSrc1 = el.find('.match-team.team1 .match-team-logo').first().attr('src') || '';
              logo1 = !logoSrc1?.includes('placeholder.svg') ? logoSrc1 : '';
            }

            if (el.find('.match-team.team2 .match-team-logo').length == 2) {
              const logoSrc2 = el.find('.match-team.team2 .match-team-logo').eq(1).attr('src') || '';
              logo2 = !logoSrc2?.includes('placeholder.svg') ? logoSrc2 : '';
            } else {
              const logoSrc2 = el.find('.match-team.team2 .match-team-logo').first().attr('src') || '';
              logo2 = !logoSrc2?.includes('placeholder.svg') ? logoSrc2 : '';
            }
            
            team1 = {
              name:
                el.find('.match-teamname').first().text() ||
                el.find('.team1 .team').text(),
              id: el.numFromAttr('team1'),
              logo: logo1
            }

            team2 = {
              name:
                el.find('.match-teamname').eq(1).text() ||
                el.find('.team2 .team').text(),
              id: el.numFromAttr('team2'),
              logo: logo2
            }
          }

          const format = el.find('.match-meta').last().text().trim();

          const eventName = el.find('.match-event').attr('data-event-headline') || '';
          const event = events.find((x) => x.name === eventName)

          return { id, date, stars, title, team1, team2, format, event, live }
        })

      return liveMatches.concat(upcomingMatches)
    }
