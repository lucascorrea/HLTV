import type { LogUpdate, ScoreboardUpdate } from '../endpoints/connectToScorebot'

/** HLTV walkover / admin-default map slug. */
export const isDefaultForfeitMapName = (
  mapName: string | null | undefined
): boolean => (mapName?.trim().toLowerCase() ?? '') === 'default'

/** Scorebot placeholder side labels when HLTV has no real server roster. */
export const isPlaceholderScorebotTeamNames = (
  ctTeamName: string,
  terroristTeamName: string
): boolean => {
  const ct = ctTeamName.trim().toLowerCase()
  const terrorist = terroristTeamName.trim().toLowerCase()
  return ct === 'ct' && terrorist === 'terrorist'
}

/** Zombie scorebot on forfeit: generic sides and no players loaded. */
export const isZombieForfeitScoreboard = (board: ScoreboardUpdate): boolean => {
  if (isDefaultForfeitMapName(board.mapName)) {
    return true
  }

  return (
    isPlaceholderScorebotTeamNames(board.ctTeamName, board.terroristTeamName) &&
    board.CT.length === 0 &&
    board.TERRORIST.length === 0
  )
}

export const logUpdateHasDefaultForfeitSignal = (
  logUpdate: LogUpdate
): boolean => {
  for (const entry of logUpdate.log) {
    if (
      'MatchStarted' in entry &&
      isDefaultForfeitMapName(entry.MatchStarted.map)
    ) {
      return true
    }
  }

  return false
}
