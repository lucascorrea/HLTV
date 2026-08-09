import {
  countSeriesMapWins,
  isDecisiveMapRoundTotals,
  isPlausibleSeriesMapScore,
  isWalkoverDefaultMap,
  resolveSeriesResultMatch,
} from '../src/scorebot/mapSeriesWins'

describe('mapSeriesWins', () => {
  it('counts decisive map wins from map results', () => {
    expect(
      countSeriesMapWins([
        { result: { team1TotalRounds: 13, team2TotalRounds: 11 } },
        { result: undefined },
      ])
    ).toEqual({ team1Win: 1, team2Win: 0 })
  })

  it('rejects HLTV team id sized values as map scores', () => {
    expect(isPlausibleSeriesMapScore(13617)).toBe(false)
    expect(isPlausibleSeriesMapScore(2)).toBe(true)
  })

  it('detects decisive CS2 map totals (OT period + win-by-2)', () => {
    expect(isDecisiveMapRoundTotals(13, 11)).toBe(true)
    expect(isDecisiveMapRoundTotals(16, 14)).toBe(true)
    expect(isDecisiveMapRoundTotals(16, 15)).toBe(false)
    expect(isDecisiveMapRoundTotals(21, 19)).toBe(false)
    expect(isDecisiveMapRoundTotals(22, 20)).toBe(true)
    expect(isDecisiveMapRoundTotals(4, 1)).toBe(false)
    expect(isDecisiveMapRoundTotals(1, 0)).toBe(false)
  })

  it('counts walkover default map 1-0 as a series map win', () => {
    expect(
      countSeriesMapWins([
        {
          name: 'default',
          result: { team1TotalRounds: 1, team2TotalRounds: 0 },
        },
        { name: 'tba' },
        { name: 'tba' },
      ])
    ).toEqual({ team1Win: 1, team2Win: 0 })
  })

  it('does not treat mid-map non-default scores as walkovers', () => {
    expect(
      countSeriesMapWins([
        {
          name: 'nuke',
          result: { team1TotalRounds: 1, team2TotalRounds: 0 },
        },
      ])
    ).toEqual({ team1Win: 0, team2Win: 0 })
  })

  it('isWalkoverDefaultMap only matches default', () => {
    expect(isWalkoverDefaultMap({ name: 'default' })).toBe(true)
    expect(isWalkoverDefaultMap({ name: 'Default' })).toBe(true)
    expect(isWalkoverDefaultMap({ name: 'nuke' })).toBe(false)
  })

  // Match 2396097: Over + winnerTeam but MR12 left resultMatch 0-0.
  it('resolveSeriesResultMatch falls back to winnerTeam when Over and maps are empty', () => {
    expect(
      resolveSeriesResultMatch([], {
        status: 'Over',
        winnerTeamId: 13894,
        team1Id: 13894,
        team2Id: 13161,
      })
    ).toEqual({ team1Win: 1, team2Win: 0 })
  })

  it('resolveSeriesResultMatch prefers map walkover over winnerTeam', () => {
    expect(
      resolveSeriesResultMatch(
        [
          {
            name: 'default',
            result: { team1TotalRounds: 0, team2TotalRounds: 1 },
          },
        ],
        {
          status: 'Over',
          winnerTeamId: 1,
          team1Id: 1,
          team2Id: 2,
        }
      )
    ).toEqual({ team1Win: 0, team2Win: 1 })
  })
})
