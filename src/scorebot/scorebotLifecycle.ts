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

/** MR12-style map win on current map score (simplified). */
export const isDecisiveMapRoundScore = (
  counterTerroristScore: number,
  terroristScore: number
): boolean => {
  const max = Math.max(counterTerroristScore, terroristScore)
  const min = Math.min(counterTerroristScore, terroristScore)
  return max >= 13 && max - min >= 2
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
