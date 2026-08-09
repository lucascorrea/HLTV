import type { ScoreboardUpdate } from '../endpoints/connectToScorebot'
import { isPlausibleSeriesMapScore } from './mapSeriesWins'
import type { MatchPageSeriesMapWins } from './matchPageSeriesMaps'
import { isDecisiveMapRoundScore } from './scorebotLifecycle'

/**
 * Scoreboard-only map-end gate (no RoundEnd).
 * Delegates to `isDecisiveMapRoundScore` (OT win-by-2). Kept as a named helper
 * so call sites stay explicit about scoreboard-fallback vs RoundEnd.
 */
export const isScoreboardFallbackMapDecisive = (
  counterTerroristScore: number,
  terroristScore: number
): boolean =>
  isDecisiveMapRoundScore(counterTerroristScore, terroristScore)

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
  /** Prevents double-counting the same map from RoundEnd + scoreboard. */
  private countedMaps = new Set<string>()
  /**
   * Sum of page map wins at the last non-optimistic page scrape baseline.
   * Used so reconnect mid-series can count new decisive maps on top of page.
   */
  private pageBaselineTotal: number | null = null
  /** Per-team page wins before optimistic OT bumps (undo false map ends). */
  private pageBaselineWins: { team1Win: number; team2Win: number } | null =
    null

  notePageSeries(
    team1Name: string,
    team1Win: number,
    team2Name: string,
    team2Win: number
  ): void {
    const incomingTotal = team1Win + team2Win

    if (
      this.pageSeries &&
      this.pageSeries.team1Name === team1Name &&
      this.pageSeries.team2Name === team2Name
    ) {
      const prevTotal =
        this.pageSeries.team1Win + this.pageSeries.team2Win
      const mergedT1 = Math.max(this.pageSeries.team1Win, team1Win)
      const mergedT2 = Math.max(this.pageSeries.team2Win, team2Win)
      this.pageSeries = {
        team1Name,
        team2Name,
        team1Win: mergedT1,
        team2Win: mergedT2,
      }

      // Page caught up past our previous scrape — drop session event deltas
      // so baseline+events cannot double-count maps the DOM already has.
      if (incomingTotal > prevTotal) {
        this.eventWins.clear()
        this.pageBaselineTotal = incomingTotal
        this.pageBaselineWins = { team1Win, team2Win }
      }
    } else {
      this.pageSeries = { team1Name, team2Name, team1Win, team2Win }
      this.pageBaselineTotal = incomingTotal
      this.pageBaselineWins = { team1Win, team2Win }
    }

    if (this.pageBaselineTotal == null) {
      this.pageBaselineTotal = incomingTotal
    }
    if (this.pageBaselineWins == null) {
      this.pageBaselineWins = { team1Win, team2Win }
    }
  }

  noteMapEnded(
    roundEnd: MapEndedRoundEnd,
    lastBoard: ScoreboardUpdate
  ): void {
    const mapKey = lastBoard.mapName || 'unknown'
    if (this.countedMaps.has(mapKey)) {
      return
    }

    const winnerTeam =
      roundEnd.winner === 'CT'
        ? lastBoard.ctTeamName
        : lastBoard.terroristTeamName

    // Page already shows a decided series (e.g. 2-1) — do not re-count the
    // leftover decisive scoreboard after reconnect at match_over.
    if (this.pageSeries && this.isPageSeriesAlreadyDecided()) {
      this.countedMaps.add(mapKey)
      return
    }

    this.countedMaps.add(mapKey)
    this.eventWins.set(
      winnerTeam,
      (this.eventWins.get(winnerTeam) ?? 0) + 1
    )

    // Optimistic bump: HLTV DOM / page scrape often lags the decisive board
    // (BO3 map3 at 1-1 → match_over before page flips to 1-2).
    // expected = page baseline + session event wins (not countedMaps — decided
    // series skip marks countedMaps without an event win).
    if (this.pageSeries && this.pageBaselineTotal != null) {
      const eventTotal = Array.from(this.eventWins.values()).reduce(
        (sum, maps) => sum + maps,
        0
      )
      const expectedMinTotal = this.pageBaselineTotal + eventTotal
      const currentTotal =
        this.pageSeries.team1Win + this.pageSeries.team2Win
      if (currentTotal < expectedMinTotal) {
        if (winnerTeam === this.pageSeries.team1Name) {
          this.pageSeries = {
            ...this.pageSeries,
            team1Win: this.pageSeries.team1Win + 1,
          }
        } else if (winnerTeam === this.pageSeries.team2Name) {
          this.pageSeries = {
            ...this.pageSeries,
            team2Win: this.pageSeries.team2Win + 1,
          }
        }
      }
    }
  }

  /**
   * Undo a false map-end when the same map keeps playing (OT period "end"
   * then continues — 22-20 → 22-22 on 2396181).
   * Resets optimistic page bumps + event wins even if countedMaps was lost
   * across reconnect.
   * @returns true when series was retracted
   */
  retractIfMapStillLive(board: ScoreboardUpdate): boolean {
    if (board.live === false) {
      return false
    }
    if (
      isDecisiveMapRoundScore(
        board.counterTerroristScore,
        board.terroristScore
      )
    ) {
      return false
    }

    const mapKey = board.mapName || 'unknown'
    const hadCounted = this.countedMaps.has(mapKey)
    const hadEvents = this.eventWins.size > 0
    const optimistic =
      this.pageSeries != null &&
      this.pageBaselineWins != null &&
      (this.pageSeries.team1Win > this.pageBaselineWins.team1Win ||
        this.pageSeries.team2Win > this.pageBaselineWins.team2Win)

    if (!hadCounted && !hadEvents && !optimistic) {
      return false
    }

    this.countedMaps.delete(mapKey)
    this.eventWins.clear()
    if (this.pageSeries && this.pageBaselineWins) {
      this.pageSeries = {
        ...this.pageSeries,
        team1Win: this.pageBaselineWins.team1Win,
        team2Win: this.pageBaselineWins.team2Win,
      }
    }
    return true
  }

  /**
   * True when page series already has a leader with ≥2 maps (BO3/BO5 decided).
   * Prevents decisive leftover boards from bumping 2-1 → 2-2 / 3-1.
   */
  private isPageSeriesAlreadyDecided(): boolean {
    if (!this.pageSeries) {
      return false
    }
    const { team1Win, team2Win } = this.pageSeries
    const leader = Math.max(team1Win, team2Win)
    const trailer = Math.min(team1Win, team2Win)
    return leader >= 2 && leader > trailer
  }

  /**
   * Fallback when HLTV omits RoundEnd (or it arrives after the last scoreboard):
   * count the map win from a decisive live scoreboard snapshot.
   * @returns true when a new map win was recorded
   */
  noteDecisiveScoreboard(board: ScoreboardUpdate): boolean {
    if (
      !isScoreboardFallbackMapDecisive(
        board.counterTerroristScore,
        board.terroristScore
      )
    ) {
      return false
    }

    const beforeEventTotal = Array.from(this.eventWins.values()).reduce(
      (sum, maps) => sum + maps,
      0
    )
    const beforeT1 = this.pageSeries?.team1Win
    const beforeT2 = this.pageSeries?.team2Win
    const winner =
      board.counterTerroristScore > board.terroristScore ? 'CT' : 'TERRORIST'
    this.noteMapEnded({ winner }, board)
    const afterEventTotal = Array.from(this.eventWins.values()).reduce(
      (sum, maps) => sum + maps,
      0
    )
    const pageBumped =
      this.pageSeries != null &&
      (this.pageSeries.team1Win !== beforeT1 ||
        this.pageSeries.team2Win !== beforeT2)
    // Decided-series skip marks countedMaps but must not look like a new win.
    return afterEventTotal > beforeEventTotal || pageBumped
  }

  getDisplay(board: ScoreboardUpdate): MapsScoreDisplay | null {
    // Live non-decisive board: never show optimistic OT map-ends or HLTV
    // ctTeamScore/tTeamScore series ghosts (2396181 stuck at 0-1 during OT).
    if (
      board.live !== false &&
      !isDecisiveMapRoundScore(
        board.counterTerroristScore,
        board.terroristScore
      )
    ) {
      this.retractIfMapStillLive(board)
      if (this.pageSeries && this.pageBaselineWins) {
        return mapSeriesWinsToScoreboardTeams(
          board,
          this.pageSeries.team1Name,
          this.pageBaselineWins.team1Win,
          this.pageSeries.team2Name,
          this.pageBaselineWins.team2Win
        )
      }
      return null
    }

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
