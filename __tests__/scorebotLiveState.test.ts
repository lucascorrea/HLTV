import type { ScoreboardUpdate } from '../src/endpoints/connectToScorebot'
import { ScorebotLiveStateTracker } from '../src/scorebot/scorebotLiveState'

const baseBoard = (): ScoreboardUpdate => ({
  TERRORIST: [],
  CT: [],
  ctMatchHistory: { firstHalf: [], secondHalf: [] },
  terroristMatchHistory: { firstHalf: [], secondHalf: [] },
  bombPlanted: true,
  mapName: 'de_nuke',
  terroristTeamName: 'T',
  ctTeamName: 'CT',
  currentRound: 1,
  counterTerroristScore: 0,
  terroristScore: 0,
  ctTeamId: 1,
  tTeamId: 2,
  frozen: false,
  live: false,
  ctTeamScore: 0,
  tTeamScore: 0,
  startingCt: 0,
  startingT: 0,
})

describe('ScorebotLiveStateTracker', () => {
  it('sets live=true during combat when HLTV sends live=false', () => {
    const tracker = new ScorebotLiveStateTracker()
    const normalized = tracker.normalizeScoreboard(baseBoard())

    expect(normalized.hltvLive).toBe(false)
    expect(normalized.live).toBe(true)
  })

  it('preserves hltvLive=true between rounds while match live stays true', () => {
    const tracker = new ScorebotLiveStateTracker()
    tracker.normalizeScoreboard(baseBoard())

    const betweenRounds = tracker.normalizeScoreboard({
      ...baseBoard(),
      live: true,
      bombPlanted: false,
      counterTerroristScore: 0,
      terroristScore: 1,
    })

    expect(betweenRounds.hltvLive).toBe(true)
    expect(betweenRounds.live).toBe(true)
  })

  it('emits live=false when match ends', () => {
    const tracker = new ScorebotLiveStateTracker()
    const liveBoard = tracker.normalizeScoreboard(baseBoard())
    const ended = tracker.buildEndedScoreboard(liveBoard)

    expect(ended.live).toBe(false)
    expect(tracker.isLive).toBe(false)
  })

  it('does not flip hltvLive on re-normalize', () => {
    const tracker = new ScorebotLiveStateTracker()
    const first = tracker.normalizeScoreboard({ ...baseBoard(), live: false })
    const second = tracker.normalizeScoreboard({
      ...first,
      live: true,
    })

    expect(second.hltvLive).toBe(false)
    expect(second.live).toBe(true)
  })
})
