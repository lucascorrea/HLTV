import { HLTVConfig } from '../config'
import { HLTVScraper } from '../scraper'
import { Article } from '../shared/Article'
import { Country } from '../shared/Country'
import { Player } from '../shared/Player'
import { fetchPage, generateRandomSuffix, getIdAt, parseNumber } from '../utils'
import { parseTeamRankingDevelopment } from './parseTeamRankingDevelopment'
import type { RankingPoint } from './parseTeamRankingDevelopment'

export enum TeamPlayerType {
  Coach = 'Coach',
  Starter = 'Starter',
  Substitute = 'Substitute',
  Benched = 'Benched'
}

export interface FullTeamPlayer extends Player {
  type: TeamPlayerType
  timeOnTeam: string
  mapsPlayed: number
}

export interface TeamMatch {
  id: number
  date: number
  team1: {
    id: number
    name: string
    logo?: string
  }
  team2: {
    id: number
    name: string
    logo?: string
  }
}

export interface TeamMatchResult extends TeamMatch {
  result: {
    team1Score: number
    team2Score: number
  }
}

export interface FullTeam {
  id: number
  name: string
  logo?: string
  facebook?: string
  twitter?: string
  instagram?: string
  country?: Country
  rank?: number
  players?: FullTeamPlayer[]
  rankingDevelopment?: RankingPoint[] // Alterado para incluir data
  news?: Article[]
  upcomingMatches?: TeamMatch[]
  recentResults?: TeamMatchResult[]
}

/** `#3(#1)` → 3. The first number is the HLTV world rank; the parenthesis is regional. */
export function parseProfileWorldRank(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const match = raw.match(/#\s*(\d+)/) || raw.match(/(\d+)/)
  return parseNumber(match?.[1])
}

export const getTeam =
  (config: HLTVConfig) =>
  async ({ id }: { id: number }): Promise<FullTeam> => {
    const $ = HLTVScraper(
      await fetchPage(
        `https://www.hltv.org/team/${id}/${generateRandomSuffix()}`,
        config.loadPage,
        config.loadPageFlareSolverr
      )
    )

    const name = $('.profile-team-name').text()
    const logoSrc = $('.teamlogo.night-only').attr('src') || 
                    $('.teamlogo.night-only').attr('data-cookieblock-src') || 
                    $('.teamlogo:not(.day-only)').attr('src') || 
                    $('.teamlogo:not(.day-only)').attr('data-cookieblock-src'); // Default to an empty string if undefined
    const logo = !logoSrc?.includes('placeholder.svg') ? logoSrc : '';
    const facebook = $('.facebook').parent().attr('href')
    const twitter = $('.twitter').parent().attr('href')
    const instagram = $('.instagram').parent().attr('href')
    const worldRankRow = $('.profile-team-stat').filter((_, el) => {
      const label = (el.text() || '').toLowerCase()
      return label.includes('world ranking') && !label.includes('valve ranking')
    })
    // `.right` is `#3` plus a regional link `(#1)`. The first anchor is the HLTV rank.
    const rank = parseProfileWorldRank(
      worldRankRow.find('.right a').first().text() || worldRankRow.find('.right').text()
    )

    const players = $('.players-table tbody tr')
      .toArray()
      .map((el) => ({
        photo: el.find('.playersBox-img-wrapper img').attr('src') || 
               el.find('.playersBox-img-wrapper img').attr('data-cookieblock-src') || '',
        name: el
          .find(
            '.playersBox-playernick-image .playersBox-playernick .text-ellipsis'
          )
          .text(),
        id: el
          .find('.playersBox-playernick-image')
          .attrThen('href', getIdAt(2)),
        timeOnTeam: el.find('td').eq(2).trimText()!,
        mapsPlayed: el.find('td').eq(3).numFromText()!,
        type: getPlayerType(el.find('.player-status').text())!
      }))
      .concat(
        ...($('.coach-table').exists()
          ? [
              {
                photo: $('.coach-table .playersBox-img-wrapper img').attr('src') || 
                       $('.coach-table .playersBox-img-wrapper img').attr('data-cookieblock-src') || '',
                id: $('.coach-table .playersBox-playernick-image').attrThen(
                  'href',
                  getIdAt(2)
                ),
                name: $(
                  '.coach-table .playersBox-playernick-image .playersBox-playernick .text-ellipsis'
                ).text(),
                timeOnTeam: $('.coach-table tbody tr')
                  .first()
                  .find('td')
                  .eq(1)
                  .trimText()!,
                mapsPlayed: $('.coach-table tbody tr')
                  .first()
                  .find('td')
                  .eq(2)
                  .numFromText()!,
                type: TeamPlayerType.Coach
              }
            ]
          : [])
      )

    let rankingDevelopment: RankingPoint[]
    try {
      rankingDevelopment = parseTeamRankingDevelopment({
        chartJs: $('[data-chartjs-config]')
          .toArray()
          .map((el) => el.attr('data-chartjs-config')),
        fusion: $('.graph').attr('data-fusionchart-config'),
      })
    } catch (error) {
      console.error('Error parsing ranking data:', error)
      rankingDevelopment = []
    }

    const country = {
      name: $('.team-country .flag').attr('alt') || 'Unknown' // Default to 'Unknown' if undefined
    }

    const news = $('#newsBox a')
      .toArray()
      .map((el) => ({
        name: el.contents().eq(1).text(),
        link: el.attr('href')
      }))
      
    // Extraindo upcoming matches
    const upcomingMatches = $('#matchesBox table.match-table .team-row')
      .toArray()
      .filter(el => el.find('.matchpage-button').exists())
      .map((matchEl) => {
        const dateEl = matchEl.find('.date-cell span');
        const date = dateEl.attr('data-unix') ? Number(dateEl.attr('data-unix')) : 0;
        
        const team1El = matchEl.find('.team-flex').first();
        const team1Link = team1El.find('a').first().attr('href');
        const team1Id = team1Link ? getIdAt(2)(team1Link) : '0';
        const team1Name = team1El.find('.team-name').text();
        const team1Logo = team1El.find('.team-logo.night-only').attr('src') || 
                         team1El.find('.team-logo.night-only').attr('data-cookieblock-src') || 
                         team1El.find('.team-logo:not(.day-only)').attr('src') || 
                         team1El.find('.team-logo:not(.day-only)').attr('data-cookieblock-src');
        
        const team2El = matchEl.find('.team-flex').last();
        const team2Link = team2El.find('a').first().attr('href');
        const team2Id = team2Link ? getIdAt(2)(team2Link) : '0';
        const team2Name = team2El.find('.team-name').text();
        const team2Logo = team2El.find('.team-logo.night-only').attr('src') || 
                         team2El.find('.team-logo.night-only').attr('data-cookieblock-src') || 
                         team2El.find('.team-logo:not(.day-only)').attr('src') || 
                         team2El.find('.team-logo:not(.day-only)').attr('data-cookieblock-src');
        
        // Extrair o ID da partida da URL
        const matchLink = matchEl.find('.matchpage-button').attr('href');
        const matchId = matchLink ? getIdAt(2)(matchLink) : '0';
        
        // Extrair informações do evento da URL da partida
        const matchUrl = matchEl.find('.matchpage-button').attr('href') || '';
        const urlParts = matchUrl.split('/');
        if (urlParts.length >= 3) {
          const eventSlug = urlParts[urlParts.length - 1].split('-').slice(3).join('-');
          return {
            id: Number(matchId),
            date,
            team1: { id: Number(team1Id || '0'), name: team1Name, logo: team1Logo },
            team2: { id: Number(team2Id || '0'), name: team2Name, logo: team2Logo },
          };
        }
        
        // Fallback se não conseguir extrair da URL
        return {
          id: Number(matchId),
          date,
          team1: { id: Number(team1Id || '0'), name: team1Name, logo: team1Logo },
          team2: { id: Number(team2Id || '0'), name: team2Name, logo: team2Logo }
        };
      });
      
    // Extraindo recent results
    const recentResults = $('#matchesBox table.match-table .team-row')
      .toArray()
      .filter(el => el.find('.stats-button').exists()) // Filtra apenas partidas com resultados
      .map((matchEl) => {
        const dateEl = matchEl.find('.date-cell span');
        const date = dateEl.attr('data-unix') ? Number(dateEl.attr('data-unix')) : 0;
        
        const team1El = matchEl.find('.team-flex').first();
        const team1Link = team1El.find('a').first().attr('href');
        const team1Id = team1Link ? getIdAt(2)(team1Link) : '0';
        const team1Name = team1El.find('.team-name').text();

        const team1Logo = team1El.find('.team-logo.night-only').attr('src') || 
                         team1El.find('.team-logo.night-only').attr('data-cookieblock-src') || 
                         team1El.find('.team-logo:not(.day-only)').attr('src') || 
                         team1El.find('.team-logo:not(.day-only)').attr('data-cookieblock-src');
        const team1Score = matchEl.find('.score-cell .score').first().numFromText() || 0;
        
        const team2El = matchEl.find('.team-flex').last();
        const team2Link = team2El.find('a').first().attr('href');
        const team2Id = team2Link ? getIdAt(2)(team2Link) : '0';
        const team2Name = team2El.find('.team-name').text();
        const team2Logo = team2El.find('.team-logo.night-only').attr('src') || 
                         team2El.find('.team-logo.night-only').attr('data-cookieblock-src') || 
                         team2El.find('.team-logo:not(.day-only)').attr('src') || 
                         team2El.find('.team-logo:not(.day-only)').attr('data-cookieblock-src');
        const team2Score = matchEl.find('.score-cell .score').last().numFromText() || 0;
        
        // Extrair o ID da partida da URL
        const matchLink = matchEl.find('.stats-button').attr('href');
        const matchId = matchLink ? getIdAt(2)(matchLink) : '0';
        
        // Extrair informações do evento da URL da partida
        const matchUrl = matchEl.find('.stats-button').attr('href') || '';
        
        return {
          id: Number(matchId),
          date,
          team1: {
            id: Number(team1Id || '0'),
            name: team1Name,
            logo: team1Logo
          },
          team2: {
            id: Number(team2Id || '0'),
            name: team2Name,
            logo: team2Logo
          },
          result: {
            team1Score,
            team2Score
          }
        };
      })
      // Newest first; tie-break by match id so same-day rows stay deterministic (streak / last-5 UI).
      .sort((a, b) => b.date - a.date || b.id - a.id)

    return {
      id,
      name,
      logo,
      facebook,
      twitter,
      instagram,
      country,
      rank,
      players,
      rankingDevelopment,
      news,
      upcomingMatches,
      recentResults
    }
  }

function getPlayerType(text: string): TeamPlayerType | undefined {
  if (text === 'STARTER') {
    return TeamPlayerType.Starter
  }
  if (text === 'BENCHED') {
    return TeamPlayerType.Benched
  }
  if (text === 'SUBSTITUTE') {
    return TeamPlayerType.Substitute
  }
}
