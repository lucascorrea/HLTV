import type { LogUpdate, ScoreboardUpdate } from '../endpoints/connectToScorebot'

type RoundEndPayload = {
  counterTerroristScore: number
  terroristScore: number
  winner: string
  winType: string
}

export type ScorebotLifecycleEvent =
  | {
      type: 'map_ended'
      mapName: string
      roundEnd: RoundEndPayload
    }
  | {
      type: 'map_started'
      map: string
    }
  | {
      type: 'players_leaving'
      players: string[]
    }
  | {
      type: 'between_rounds'
      mapName: string
      hltvLive: boolean
      frozen: boolean
    }

/**
 * MR12 map finished on current round score?
 * - Regulation: first to 13 before OT (13-0 … 13-11). At 12-12 → overtime.
 * - Overtime: MR3 periods start at 12 / 15 / 18 / 21… After each 3-3 tie the
 *   next period begins. A period ends only at periodStart+4 with win-by-2
 *   (16-14, 19-17, 22-20…). Lead-of-1 mid period (16-15, 19-18, 21-19) must
 *   NOT end the map — that falsely bumped LA series on 2395957 / 2396181 while
 *   Ancient was still in OT.
 *
 * Real MR3 4-3 endings (16-15 / 19-18 / 22-21) resolve via page series /
 * live=false / next-map rather than this scoreboard heuristic.
 */
export const isDecisiveMapRoundScore = (
  counterTerroristScore: number,
  terroristScore: number
): boolean => {
  const max = Math.max(counterTerroristScore, terroristScore)
  const min = Math.min(counterTerroristScore, terroristScore)

  // Regulation: reached 13 while opponent never hit 12-12 (≤11).
  if (max >= 13 && min < 12) {
    return true
  }

  if (min < 12 || max === min) {
    return false
  }

  // Current OT period start (12, 15, 18, 21…).
  const periodStart = 12 + 3 * Math.floor((min - 12) / 3)
  return max >= periodStart + 4 && max - min >= 2
}

const getRoundEnd = (log: LogUpdate['log'][number]): RoundEndPayload | null => {
  if (!('RoundEnd' in log)) {
    return null
  }

  return log.RoundEnd
}

/** Derives high-level lifecycle hints from scorebot stream (not full series result). */
export class ScorebotLifecycleTracker {
  private lastMapName: string | null = null
  private recentQuits: string[] = []

  consumeScoreboard(board: ScoreboardUpdate): ScorebotLifecycleEvent[] {
    const events: ScorebotLifecycleEvent[] = []

    if (
      this.lastMapName &&
      board.mapName !== this.lastMapName &&
      board.currentRound <= 1
    ) {
      events.push({ type: 'map_started', map: board.mapName })
    }

    if (board.hltvLive === true && !board.frozen) {
      events.push({
        type: 'between_rounds',
        mapName: board.mapName,
        hltvLive: true,
        frozen: board.frozen,
      })
    }

    this.lastMapName = board.mapName
    return events
  }

  consumeLog(logUpdate: LogUpdate, mapName: string | null): ScorebotLifecycleEvent[] {
    const events: ScorebotLifecycleEvent[] = []

    for (const entry of logUpdate.log) {
      const roundEnd = getRoundEnd(entry)
      if (
        roundEnd &&
        isDecisiveMapRoundScore(
          roundEnd.counterTerroristScore,
          roundEnd.terroristScore
        )
      ) {
        events.push({
          type: 'map_ended',
          mapName: mapName ?? 'unknown',
          roundEnd,
        })
        this.recentQuits = []
      }

      if ('MatchStarted' in entry) {
        events.push({ type: 'map_started', map: entry.MatchStarted.map })
      }

      if ('PlayerQuit' in entry) {
        this.recentQuits.push(entry.PlayerQuit.playerNick)
        if (this.recentQuits.length >= 3) {
          events.push({
            type: 'players_leaving',
            players: [...this.recentQuits],
          })
          this.recentQuits = []
        }
      }
    }

    return events
  }
}

export const formatLifecycleEvent = (event: ScorebotLifecycleEvent): string => {
  switch (event.type) {
    case 'map_ended':
      return `[lifecycle] MAP ENDED ${event.mapName} ${event.roundEnd.counterTerroristScore}-${event.roundEnd.terroristScore} winner=${event.roundEnd.winner}`
    case 'map_started':
      return `[lifecycle] MAP STARTED ${event.map}`
    case 'players_leaving':
      return `[lifecycle] PLAYERS LEAVING ${event.players.join(', ')}`
    case 'between_rounds':
      return `[lifecycle] BETWEEN ROUNDS map=${event.mapName} hltvLive=${event.hltvLive} frozen=${event.frozen}`
    default:
      return `[lifecycle] ${JSON.stringify(event)}`
  }
}
