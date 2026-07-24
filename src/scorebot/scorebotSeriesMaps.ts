import type { ScoreboardUpdate } from '../endpoints/connectToScorebot'
import { isPlausibleSeriesMapScore } from './mapSeriesWins'
import type { MatchPageSeriesMapWins } from './matchPageSeriesMaps'

export type MapsScoreDisplay = {
  team1: string
  team1Maps: number
  team2: string
  team2Maps: number
}

type MapEndedRoundEnd = {
  winner: string
}

/** ctTeamScore/tTeamScore copy live round score during an active map. */
export const scoreboardTeamScoresMirrorRoundScore = (
  data: ScoreboardUpdate
): boolean =>
  data.ctTeamScore === data.counterTerroristScore &&
  data.tTeamScore === data.terroristScore

export const mapSeriesWinsToScoreboardTeams = (
  board: ScoreboardUpdate,
  team1Name: string,
  team1Win: number,
  team2Name: string,
  team2Win: number
): MapsScoreDisplay | null => {
  if (team1Win + team2Win === 0) {
    return null
  }

  const wins = new Map<string, number>([
    [team1Name, team1Win],
    [team2Name, team2Win],
  ])

  return {
    team1: board.ctTeamName,
    team1Maps: wins.get(board.ctTeamName) ?? 0,
    team2: board.terroristTeamName,
    team2Maps: wins.get(board.terroristTeamName) ?? 0,
  }
}

/**
 * Fallback when HLTV exposes series counters in ctTeamScore/tTeamScore
 * (only when they differ from live round score and look like map counts).
 */
export const getSeriesMapsDisplayFromScoreboard = (
  data: ScoreboardUpdate
): MapsScoreDisplay | null => {
  if (scoreboardTeamScoresMirrorRoundScore(data)) {
    return null
  }

  if (
    !isPlausibleSeriesMapScore(data.ctTeamScore) ||
    !isPlausibleSeriesMapScore(data.tTeamScore)
  ) {
    return null
  }

  if (data.ctTeamScore + data.tTeamScore === 0) {
    return null
  }

  return {
    team1: data.ctTeamName,
    team1Maps: data.ctTeamScore,
    team2: data.terroristTeamName,
    team2Maps: data.tTeamScore,
  }
}

export const formatMapsScoreSuffix = (
  maps: MapsScoreDisplay | null | undefined
): string => {
  if (!maps) {
    return ''
  }

  return ` | maps ${maps.team1} ${maps.team1Maps}-${maps.team2Maps} ${maps.team2}`
}

/** Tracks BO series map wins from HLTV page + decisive RoundEnd events. */
export class ScorebotSeriesMapsTracker {
  private pageSeries: MatchPageSeriesMapWins | null = null
  private eventWins = new Map<string, number>()

  notePageSeries(
    team1Name: string,
    team1Win: number,
    team2Name: string,
    team2Win: number
  ): void {
    this.pageSeries = { team1Name, team2Name, team1Win, team2Win }
  }

  noteMapEnded(
    roundEnd: MapEndedRoundEnd,
    lastBoard: ScoreboardUpdate
  ): void {
    const winnerTeam =
      roundEnd.winner === 'CT'
        ? lastBoard.ctTeamName
        : lastBoard.terroristTeamName

    this.eventWins.set(
      winnerTeam,
      (this.eventWins.get(winnerTeam) ?? 0) + 1
    )
  }

  getDisplay(board: ScoreboardUpdate): MapsScoreDisplay | null {
    if (this.pageSeries) {
      const fromPage = mapSeriesWinsToScoreboardTeams(
        board,
        this.pageSeries.team1Name,
        this.pageSeries.team1Win,
        this.pageSeries.team2Name,
        this.pageSeries.team2Win
      )
      if (fromPage) {
        return fromPage
      }
    }

    const eventTotal = Array.from(this.eventWins.values()).reduce(
      (sum, maps) => sum + maps,
      0
    )
    if (eventTotal > 0) {
      return {
        team1: board.ctTeamName,
        team1Maps: this.eventWins.get(board.ctTeamName) ?? 0,
        team2: board.terroristTeamName,
        team2Maps: this.eventWins.get(board.terroristTeamName) ?? 0,
      }
    }

    return getSeriesMapsDisplayFromScoreboard(board)
  }

  /** HLTV page team1/team2 order — used when the full series is over. */
  getFinalDisplay(): MapsScoreDisplay | null {
    if (!this.pageSeries) {
      return null
    }

    const { team1Name, team2Name, team1Win, team2Win } = this.pageSeries
    if (team1Win + team2Win === 0) {
      return null
    }

    return {
      team1: team1Name,
      team1Maps: team1Win,
      team2: team2Name,
      team2Maps: team2Win,
    }
  }
}

export const formatFinalSeriesLine = (
  series: MapsScoreDisplay | null | undefined
): string | null => {
  if (!series || series.team1Maps + series.team2Maps === 0) {
    return null
  }

  return `final ${series.team1} ${series.team1Maps}-${series.team2Maps} ${series.team2}`
}
