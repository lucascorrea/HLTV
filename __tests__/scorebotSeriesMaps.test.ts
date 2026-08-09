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

  it('counts decisive scoreboard map win once (RoundEnd may be missing)', () => {
    const tracker = new ScorebotSeriesMapsTracker()
    const ended = baseBoard({
      mapName: 'de_dust2',
      currentRound: 24,
      counterTerroristScore: 13,
      terroristScore: 10,
      ctTeamName: 'HEROIC',
      terroristTeamName: 'Astralis',
      ctTeamScore: 13,
      tTeamScore: 10,
    })

    expect(tracker.noteDecisiveScoreboard(ended)).toBe(true)
    expect(tracker.getDisplay(ended)).toEqual({
      team1: 'HEROIC',
      team1Maps: 1,
      team2: 'Astralis',
      team2Maps: 0,
    })
    // Idempotent for same map
    expect(tracker.noteDecisiveScoreboard(ended)).toBe(false)
    expect(tracker.getDisplay(ended)?.team1Maps).toBe(1)

    tracker.noteMapEnded({ winner: 'CT' }, ended)
    expect(tracker.getDisplay(ended)?.team1Maps).toBe(1)
  })

  it('BO3 map3: reconnect with page 1-1 + decisive board bumps to 1-2 (2395770)', () => {
    // Regression: Bounty Hunters vs ODDIK — session restarted on Mirage,
    // pageSeries stayed 1-1, match_over fired before DOM flipped to 1-2.
    const tracker = new ScorebotSeriesMapsTracker()
    tracker.notePageSeries('Bounty Hunters', 1, 'ODDIK', 1)

    const mirageEnded = baseBoard({
      mapName: 'de_mirage',
      currentRound: 15,
      counterTerroristScore: 13,
      terroristScore: 1,
      ctTeamName: 'ODDIK',
      terroristTeamName: 'Bounty Hunters',
      ctTeamId: 11768,
      tTeamId: 12776,
      ctTeamScore: 13,
      tTeamScore: 1,
    })

    expect(tracker.noteDecisiveScoreboard(mirageEnded)).toBe(true)
    expect(tracker.getDisplay(mirageEnded)).toEqual({
      team1: 'ODDIK',
      team1Maps: 2,
      team2: 'Bounty Hunters',
      team2Maps: 1,
    })
    expect(tracker.getFinalDisplay()).toEqual({
      team1: 'Bounty Hunters',
      team1Maps: 1,
      team2: 'ODDIK',
      team2Maps: 2,
    })
  })

  it('does not bump 2-1 → 3-1 when page already decided and decisive board remains', () => {
    const tracker = new ScorebotSeriesMapsTracker()
    tracker.notePageSeries('Bounty Hunters', 1, 'ODDIK', 2)

    const leftover = baseBoard({
      mapName: 'de_mirage',
      counterTerroristScore: 13,
      terroristScore: 1,
      ctTeamName: 'ODDIK',
      terroristTeamName: 'Bounty Hunters',
    })

    expect(tracker.noteDecisiveScoreboard(leftover)).toBe(false)
    expect(tracker.getFinalDisplay()).toEqual({
      team1: 'Bounty Hunters',
      team1Maps: 1,
      team2: 'ODDIK',
      team2Maps: 2,
    })
  })

  it('page lag 1-0 + leader decisive map bumps to 2-0', () => {
    const tracker = new ScorebotSeriesMapsTracker()
    tracker.notePageSeries('HEROIC', 1, 'Astralis', 0)

    const ended = baseBoard({
      mapName: 'de_inferno',
      counterTerroristScore: 13,
      terroristScore: 8,
      ctTeamName: 'HEROIC',
      terroristTeamName: 'Astralis',
    })

    expect(tracker.noteDecisiveScoreboard(ended)).toBe(true)
    expect(tracker.getFinalDisplay()).toEqual({
      team1: 'HEROIC',
      team1Maps: 2,
      team2: 'Astralis',
      team2Maps: 0,
    })
  })

  it('rejects phantom OT lead-of-1 scoreboard (16-15 after 15-15) — 2395957', () => {
    const tracker = new ScorebotSeriesMapsTracker()
    tracker.notePageSeries('1win', 1, 'Butterfly', 1)

    const phantom = baseBoard({
      mapName: 'de_mirage',
      currentRound: 31,
      counterTerroristScore: 16,
      terroristScore: 15,
      ctTeamName: 'Butterfly',
      terroristTeamName: '1win',
      ctTeamScore: 16,
      tTeamScore: 15,
      live: true,
    })

    expect(tracker.noteDecisiveScoreboard(phantom)).toBe(false)
    expect(tracker.getDisplay(phantom)).toEqual({
      team1: 'Butterfly',
      team1Maps: 1,
      team2: '1win',
      team2Maps: 1,
    })
  })

  it('accepts OT win-by-2 scoreboard fallback (16-14)', () => {
    const tracker = new ScorebotSeriesMapsTracker()
    tracker.notePageSeries('1win', 1, 'Butterfly', 1)

    const ended = baseBoard({
      mapName: 'de_mirage',
      currentRound: 30,
      counterTerroristScore: 16,
      terroristScore: 14,
      ctTeamName: 'Butterfly',
      terroristTeamName: '1win',
      ctTeamScore: 16,
      tTeamScore: 14,
      live: true,
    })

    expect(tracker.noteDecisiveScoreboard(ended)).toBe(true)
    expect(tracker.getDisplay(ended)).toEqual({
      team1: 'Butterfly',
      team1Maps: 2,
      team2: '1win',
      team2Maps: 1,
    })
  })

  it('retracts false OT map-end when same map keeps playing (2396181)', () => {
    const tracker = new ScorebotSeriesMapsTracker()
    tracker.notePageSeries('JiJieHao', 0, 'Entropy', 0)

    const falseEnd = baseBoard({
      mapName: 'de_ancient',
      currentRound: 34,
      counterTerroristScore: 17,
      terroristScore: 16,
      ctTeamName: 'JiJieHao',
      terroristTeamName: 'Entropy',
      ctTeamScore: 17,
      tTeamScore: 16,
      live: true,
    })
    // Simulate RoundEnd / optimistic bump that stuck series at 1-0.
    tracker.noteMapEnded({ winner: 'CT' }, falseEnd)
    expect(tracker.getFinalDisplay()).toEqual({
      team1: 'JiJieHao',
      team1Maps: 1,
      team2: 'Entropy',
      team2Maps: 0,
    })

    const stillPlaying = baseBoard({
      mapName: 'de_ancient',
      currentRound: 37,
      counterTerroristScore: 18,
      terroristScore: 18,
      ctTeamName: 'JiJieHao',
      terroristTeamName: 'Entropy',
      ctTeamScore: 18,
      tTeamScore: 18,
      live: true,
    })
    expect(tracker.retractIfMapStillLive(stillPlaying)).toBe(true)
    expect(tracker.getDisplay(stillPlaying)).toBeNull()
    expect(tracker.getFinalDisplay()).toBeNull()
  })

  it('getDisplay ignores optimistic series while OT map still live (2396181)', () => {
    const tracker = new ScorebotSeriesMapsTracker()
    tracker.notePageSeries('JiJieHao', 0, 'Entropy', 0)

    const periodEnd = baseBoard({
      mapName: 'de_ancient',
      counterTerroristScore: 22,
      terroristScore: 20,
      ctTeamName: 'Entropy',
      terroristTeamName: 'JiJieHao',
      ctTeamScore: 22,
      tTeamScore: 20,
      live: true,
    })
    expect(tracker.noteDecisiveScoreboard(periodEnd)).toBe(true)

    const continued = baseBoard({
      mapName: 'de_ancient',
      counterTerroristScore: 22,
      terroristScore: 22,
      ctTeamName: 'Entropy',
      terroristTeamName: 'JiJieHao',
      ctTeamScore: 0,
      tTeamScore: 1,
      live: true,
    })
    // Must not keep 0-1 (or ctTeamScore/tTeamScore ghost) while map tied in OT.
    expect(tracker.getDisplay(continued)).toBeNull()
  })

})
