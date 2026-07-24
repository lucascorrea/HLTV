import type { ScoreboardUpdate } from '../endpoints/connectToScorebot'

/** HLTV scorebot uses `live` for round freeze (true between rounds, false during combat).
 * This tracker exposes normalized `live` = match is in progress. */
export class ScorebotLiveStateTracker {
  private matchEnded = false
  private matchStarted = false

  get isLive(): boolean {
    return this.matchStarted && !this.matchEnded
  }

  markMatchEnded(): void {
    this.matchEnded = true
  }

  /** Normalize HLTV scoreboard: `live` = match live, `hltvLive` = raw round flag. */
  normalizeScoreboard(board: ScoreboardUpdate): ScoreboardUpdate {
    if (!this.matchEnded) {
      this.matchStarted = true
    }

    const hltvLive =
      board.hltvLive !== undefined ? board.hltvLive : board.live

    return {
      ...board,
      hltvLive,
      live: this.isLive,
    }
  }

  /** Final payload when match ends (same map/score, live=false). */
  buildEndedScoreboard(last: ScoreboardUpdate): ScoreboardUpdate {
    this.markMatchEnded()
    return {
      ...last,
      hltvLive: last.hltvLive ?? false,
      live: false,
    }
  }
}
