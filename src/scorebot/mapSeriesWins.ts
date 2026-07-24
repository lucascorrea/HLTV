export type MapRoundTotals = {
  team1TotalRounds: number
  team2TotalRounds: number
}

/** Same decisive-map rules as getMatch.countMapWins. */
export const isDecisiveMapRoundTotals = (
  team1TotalRounds: number,
  team2TotalRounds: number
): boolean => {
  const isTeam1Winner =
    (team1TotalRounds >= 13 &&
      team1TotalRounds >= team2TotalRounds + 2) ||
    (team1TotalRounds > team2TotalRounds && team1TotalRounds >= 16)
  const isTeam2Winner =
    (team2TotalRounds >= 13 &&
      team2TotalRounds >= team1TotalRounds + 2) ||
    (team2TotalRounds > team1TotalRounds && team2TotalRounds >= 16)

  return isTeam1Winner || isTeam2Winner
}

export const countSeriesMapWins = (
  maps: Array<{ result?: MapRoundTotals }>
): { team1Win: number; team2Win: number } =>
  maps.reduce(
    (acc, map) => {
      if (!map.result) {
        return acc
      }

      const { team1TotalRounds, team2TotalRounds } = map.result
      if (
        isDecisiveMapRoundTotals(team1TotalRounds, team2TotalRounds)
      ) {
        const team1Won =
          (team1TotalRounds >= 13 &&
            team1TotalRounds >= team2TotalRounds + 2) ||
          (team1TotalRounds > team2TotalRounds && team1TotalRounds >= 16)

        if (team1Won) {
          acc.team1Win += 1
        } else {
          acc.team2Win += 1
        }
      }

      return acc
    },
    { team1Win: 0, team2Win: 0 }
  )

/** BO map-win counters are small integers; HLTV team ids are 4+ digits. */
export const isPlausibleSeriesMapScore = (value: number): boolean =>
  Number.isInteger(value) && value >= 0 && value <= 3
