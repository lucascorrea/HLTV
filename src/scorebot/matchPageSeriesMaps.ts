import type { Page } from 'playwright'

export type MatchPageSeriesMapWins = {
  team1Name: string
  team2Name: string
  team1Win: number
  team2Win: number
}

/** Reads BO series map wins from HLTV match page `.mapholder` rows. */
export const readSeriesMapWinsFromMatchPage = async (
  page: Page
): Promise<MatchPageSeriesMapWins | null> => {
  if (page.isClosed()) {
    return null
  }

  return page.evaluate(() => {
    const readTeamName = (n: number): string | null => {
      const gradient = document.querySelector(`.team${n}-gradient .teamName`)
      if (gradient?.textContent?.trim()) {
        return gradient.textContent.trim()
      }

      const row = document.querySelector(`.match-team.team${n}`)
      const name =
        row?.querySelector('.match-team-name')?.textContent?.trim() ||
        row?.querySelector('.team')?.textContent?.trim()

      return name || null
    }

    const team1Name = readTeamName(1)
    const team2Name = readTeamName(2)
    if (!team1Name || !team2Name) {
      return null
    }

    let team1Win = 0
    let team2Win = 0

    for (const el of Array.from(document.querySelectorAll('.mapholder'))) {
      const left = Number(
        el
          .querySelector('.results-left .results-team-score')
          ?.textContent?.trim()
      )
      const right = Number(
        el
          .querySelector('.results-right .results-team-score')
          ?.textContent?.trim()
      )

      if (Number.isNaN(left) || Number.isNaN(right)) {
        continue
      }

      const isTeam1Winner =
        (left >= 13 && left >= right + 2) || (left > right && left >= 16)
      const isTeam2Winner =
        (right >= 13 && right >= left + 2) || (right > left && right >= 16)

      if (isTeam1Winner) {
        team1Win += 1
      } else if (isTeam2Winner) {
        team2Win += 1
      }
    }

    return { team1Name, team2Name, team1Win, team2Win }
  })
}
