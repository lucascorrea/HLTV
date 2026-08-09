export type MapRoundTotals = {
  team1TotalRounds: number
  team2TotalRounds: number
}

export type MapWithOptionalName = {
  name?: string
  result?: MapRoundTotals
}

/** MR12 map complete: regulation 13+ lead-by-2 before OT, or OT period end. */
export const isDecisiveMapRoundTotals = (
  team1TotalRounds: number,
  team2TotalRounds: number
): boolean => {
  const max = Math.max(team1TotalRounds, team2TotalRounds)
  const min = Math.min(team1TotalRounds, team2TotalRounds)
  if (max >= 13 && min < 12) {
    return true
  }
  if (min < 12 || max === min) {
    return false
  }
  const periodStart = 12 + 3 * Math.floor((min - 12) / 3)
  return max >= periodStart + 4 && max - min >= 2
}

export const isTeam1MapWinner = (
  team1TotalRounds: number,
  team2TotalRounds: number
): boolean =>
  isDecisiveMapRoundTotals(team1TotalRounds, team2TotalRounds) &&
  team1TotalRounds > team2TotalRounds

/**
 * HLTV walkover / forfeit maps are named `default` with a symbolic score
 * (typically 1-0). MR12 rules would leave resultMatch at 0-0.
 */
export const isWalkoverDefaultMap = (map: MapWithOptionalName): boolean => {
  const name = String(map.name ?? '')
    .toLowerCase()
    .replace(/^de_/, '')
  return name === 'default'
}

export const countSeriesMapWins = (
  maps: MapWithOptionalName[]
): { team1Win: number; team2Win: number } =>
  maps.reduce(
    (acc, map) => {
      if (!map.result) {
        return acc
      }

      const { team1TotalRounds, team2TotalRounds } = map.result
      if (!Number.isFinite(team1TotalRounds) || !Number.isFinite(team2TotalRounds)) {
        return acc
      }

      if (isDecisiveMapRoundTotals(team1TotalRounds, team2TotalRounds)) {
        if (isTeam1MapWinner(team1TotalRounds, team2TotalRounds)) {
          acc.team1Win += 1
        } else {
          acc.team2Win += 1
        }
        return acc
      }

      // Walkover: default map with unequal symbolic rounds (1-0).
      if (
        isWalkoverDefaultMap(map) &&
        team1TotalRounds !== team2TotalRounds
      ) {
        if (team1TotalRounds > team2TotalRounds) {
          acc.team1Win += 1
        } else {
          acc.team2Win += 1
        }
      }

      return acc
    },
    { team1Win: 0, team2Win: 0 }
  )

/**
 * Prefer map-derived series wins; when the match is over but maps still yield
 * 0-0 (parser lag / odd forfeit markup), fall back to winnerTeam → 1-0.
 */
export const resolveSeriesResultMatch = (
  maps: MapWithOptionalName[],
  options: {
    status?: string
    winnerTeamId?: number
    team1Id?: number
    team2Id?: number
  } = {}
): { team1Win: number; team2Win: number } => {
  const fromMaps = countSeriesMapWins(maps)
  if (fromMaps.team1Win + fromMaps.team2Win > 0) {
    return fromMaps
  }

  const status = String(options.status ?? '').toLowerCase()
  const isOver =
    status === 'over' ||
    status === 'finished' ||
    status === 'ended' ||
    status === 'completed'
  if (!isOver) {
    return fromMaps
  }

  const winnerId = options.winnerTeamId
  if (winnerId != null && winnerId === options.team1Id) {
    return { team1Win: 1, team2Win: 0 }
  }
  if (winnerId != null && winnerId === options.team2Id) {
    return { team1Win: 0, team2Win: 1 }
  }

  return fromMaps
}

/** BO map-win counters are small integers; HLTV team ids are 4+ digits. */
export const isPlausibleSeriesMapScore = (value: number): boolean =>
  Number.isInteger(value) && value >= 0 && value <= 3
