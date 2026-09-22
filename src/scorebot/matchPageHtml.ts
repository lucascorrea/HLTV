import * as cheerio from 'cheerio'
import {
  readMatchPageState,
  type MatchPageDomSnapshot,
  type MatchPageState
} from './matchPageState'
import type { MatchPageSeriesMapWins } from './matchPageSeriesMaps'

/** Same BO win rule as `readSeriesMapWinsFromMatchPage` (Playwright evaluate). */
const isBoSeriesMapWin = (winner: number, loser: number): boolean =>
  (winner >= 13 && loser < 12) ||
  (loser >= 12 &&
    winner >= 12 + 3 * Math.floor((loser - 12) / 3) + 4 &&
    winner - loser >= 2)

/** Reads scorebot attrs + countdown from match HTML (FlareSolverr, not Playwright). */
export const readMatchPageDomFromHtml = (html: string): MatchPageDomSnapshot => {
  const $ = cheerio.load(html)
  const scoreboard = $('#scoreboardElement')
  const countdown = $('.countdown').first().text().trim() || null

  let hasDefaultForfeitMapResult = false
  $('.mapholder')
    .toArray()
    .forEach((el) => {
      const name = $(el).find('.mapname').first().text().trim().toLowerCase()
      if (name !== 'default') {
        return
      }

      const left = Number(
        $(el).find('.results-left .results-team-score').first().text().trim()
      )
      const right = Number(
        $(el).find('.results-right .results-team-score').first().text().trim()
      )
      if (!Number.isNaN(left) && !Number.isNaN(right) && left + right > 0) {
        hasDefaultForfeitMapResult = true
      }
    })

  return {
    hasScoreboardElement: scoreboard.length > 0,
    scorebotUrl: scoreboard.attr('data-scorebot-url') || null,
    scorebotId: scoreboard.attr('data-scorebot-id') || null,
    countdown,
    isCountdownLive: $('.countdown.countdown-live').length > 0,
    hasDefaultForfeitMapResult
  }
}

export const readMatchPageStateFromHtml = (html: string): MatchPageState =>
  readMatchPageState(readMatchPageDomFromHtml(html))

/** Reads BO series map wins from match HTML (same selectors as the Playwright path). */
export const readSeriesMapWinsFromHtml = (
  html: string
): MatchPageSeriesMapWins | null => {
  const $ = cheerio.load(html)

  const readTeamName = (n: number): string | null => {
    const gradient = $(`.team${n}-gradient .teamName`).first().text().trim()
    if (gradient) {
      return gradient
    }

    const row = $(`.match-team.team${n}`)
    const name =
      row.find('.match-team-name').first().text().trim() ||
      row.find('.team').first().text().trim()
    return name || null
  }

  const team1Name = readTeamName(1)
  const team2Name = readTeamName(2)
  if (!team1Name || !team2Name) {
    return null
  }

  let team1Win = 0
  let team2Win = 0

  $('.mapholder')
    .toArray()
    .forEach((el) => {
      const left = Number(
        $(el).find('.results-left .results-team-score').first().text().trim()
      )
      const right = Number(
        $(el).find('.results-right .results-team-score').first().text().trim()
      )
      if (Number.isNaN(left) || Number.isNaN(right)) {
        return
      }

      if (left > right && isBoSeriesMapWin(left, right)) {
        team1Win += 1
      } else if (right > left && isBoSeriesMapWin(right, left)) {
        team2Win += 1
      }
    })

  return { team1Name, team2Name, team1Win, team2Win }
}
