import {
  countSeriesMapWins,
  isDecisiveMapRoundTotals,
  isPlausibleSeriesMapScore,
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

  it('detects decisive CS2 map totals', () => {
    expect(isDecisiveMapRoundTotals(13, 11)).toBe(true)
    expect(isDecisiveMapRoundTotals(4, 1)).toBe(false)
  })
})
