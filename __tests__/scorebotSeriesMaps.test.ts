import type { ScoreboardUpdate } from '../src/endpoints/connectToScorebot'
import {
  ScorebotSeriesMapsTracker,
  formatFinalSeriesLine,
  getSeriesMapsDisplayFromScoreboard,
  mapSeriesWinsToScoreboardTeams,
  scoreboardTeamScoresMirrorRoundScore,
} from '../src/scorebot/scorebotSeriesMaps'
import { isPlausibleSeriesMapScore } from '../src/scorebot/mapSeriesWins'

const baseBoard = (
  overrides: Partial<ScoreboardUpdate> = {}
): ScoreboardUpdate => ({
  TERRORIST: [],
  CT: [],
  ctMatchHistory: { firstHalf: [], secondHalf: [] },
  terroristMatchHistory: { firstHalf: [], secondHalf: [] },
  bombPlanted: false,
  mapName: 'de_ancient',
  terroristTeamName: 'PsychoFace',
  ctTeamName: 'ex-RUBY',
  currentRound: 6,
  counterTerroristScore: 4,
  terroristScore: 1,
  ctTeamId: 13617,
  tTeamId: 13799,
  frozen: false,
  live: true,
  ctTeamScore: 4,
  tTeamScore: 1,
  startingCt: 13617,
  startingT: 13799,
  ...overrides,
})

describe('scorebotSeriesMaps', () => {
  it('detects mirrored round score fields', () => {
    expect(scoreboardTeamScoresMirrorRoundScore(baseBoard())).toBe(true)
  })

  it('does not treat startingCt/startingT team ids as series map scores', () => {
    expect(getSeriesMapsDisplayFromScoreboard(baseBoard())).toBeNull()
    expect(isPlausibleSeriesMapScore(13617)).toBe(false)
    expect(isPlausibleSeriesMapScore(13799)).toBe(false)
  })

  it('maps page series wins to current CT/T team names', () => {
    expect(
      mapSeriesWinsToScoreboardTeams(baseBoard(), 'ex-RUBY', 1, 'PsychoFace', 0)
    ).toEqual({
      team1: 'ex-RUBY',
      team1Maps: 1,
      team2: 'PsychoFace',
      team2Maps: 0,
    })
  })

  it('uses ctTeamScore/tTeamScore when side score differs and values are plausible', () => {
    expect(
      getSeriesMapsDisplayFromScoreboard(
        baseBoard({
          mapName: 'de_dust2',
          currentRound: 24,
          counterTerroristScore: 11,
          terroristScore: 13,
          ctTeamName: 'PsychoFace',
          terroristTeamName: 'ex-RUBY',
          ctTeamScore: 0,
          tTeamScore: 1,
          startingCt: 13617,
          startingT: 13799,
        })
      )
    ).toEqual({
      team1: 'PsychoFace',
      team1Maps: 0,
      team2: 'ex-RUBY',
      team2Maps: 1,
    })
  })

  it('tracker prefers HLTV page series over socket round scores', () => {
    const tracker = new ScorebotSeriesMapsTracker()
    tracker.notePageSeries('ex-RUBY', 1, 'PsychoFace', 0)

    expect(tracker.getDisplay(baseBoard())).toEqual({
      team1: 'ex-RUBY',
      team1Maps: 1,
      team2: 'PsychoFace',
      team2Maps: 0,
    })
  })

  it('getFinalDisplay uses HLTV page team order for match end', () => {
    const tracker = new ScorebotSeriesMapsTracker()
    tracker.notePageSeries('ex-RUBY', 2, 'PsychoFace', 0)

    expect(tracker.getFinalDisplay()).toEqual({
      team1: 'ex-RUBY',
      team1Maps: 2,
      team2: 'PsychoFace',
      team2Maps: 0,
    })
    expect(formatFinalSeriesLine(tracker.getFinalDisplay())).toBe(
      'final ex-RUBY 2-0 PsychoFace'
    )
  })

  it('hides maps on first map when page series is 0-0', () => {
    const tracker = new ScorebotSeriesMapsTracker()
    tracker.notePageSeries('ex-RUBY', 0, 'PsychoFace', 0)

    expect(tracker.getDisplay(baseBoard())).toBeNull()
  })
})
