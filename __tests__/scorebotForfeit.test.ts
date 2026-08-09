import type { ScoreboardUpdate } from '../src/endpoints/connectToScorebot'
import {
  isDefaultForfeitMapName,
  isPlaceholderScorebotTeamNames,
  isZombieForfeitScoreboard,
  logUpdateHasDefaultForfeitSignal,
} from '../src/scorebot/scorebotForfeit'
import { readMatchPageState } from '../src/scorebot/matchPageState'

const emptyBoard = (overrides: Partial<ScoreboardUpdate> = {}): ScoreboardUpdate => ({
  TERRORIST: [],
  CT: [],
  ctMatchHistory: { firstHalf: [], secondHalf: [] },
  terroristMatchHistory: { firstHalf: [], secondHalf: [] },
  bombPlanted: false,
  mapName: 'de_ancient',
  terroristTeamName: 'Terrorist',
  ctTeamName: 'CT',
  currentRound: 1,
  counterTerroristScore: 0,
  terroristScore: 0,
  ctTeamId: 0,
  tTeamId: 0,
  frozen: false,
  live: true,
  hltvLive: false,
  ctTeamScore: 0,
  tTeamScore: 0,
  startingCt: 0,
  startingT: 0,
  ...overrides,
})

describe('scorebotForfeit', () => {
  it('detects default map slug', () => {
    expect(isDefaultForfeitMapName('default')).toBe(true)
    expect(isDefaultForfeitMapName('Default')).toBe(true)
    expect(isDefaultForfeitMapName('de_ancient')).toBe(false)
  })

  it('detects zombie placeholder scoreboard from WO terminal log', () => {
    expect(isZombieForfeitScoreboard(emptyBoard())).toBe(true)
    expect(
      isZombieForfeitScoreboard(
        emptyBoard({
          ctTeamName: 'Project 91',
          terroristTeamName: 'brazylijski luz',
        })
      )
    ).toBe(false)
  })

  it('detects MatchStarted default in log batch', () => {
    expect(
      logUpdateHasDefaultForfeitSignal({
        log: [{ MatchStarted: { map: 'default' } }],
      })
    ).toBe(true)
  })

  // Match 2395941: map1 Default WO + map2 live — Default row must not end series.
  it('keeps live_scorebot when Default WO row exists but scorebot is live', () => {
    expect(
      readMatchPageState({
        hasScoreboardElement: true,
        scorebotUrl: 'https://scorebot-lb.hltv.org',
        scorebotId: '2395941',
        countdown: 'LIVE',
        isCountdownLive: true,
        hasDefaultForfeitMapResult: true,
      }).kind
    ).toBe('live_scorebot')
  })

  it('reads match_over for full-series Default forfeit without live scorebot', () => {
    expect(
      readMatchPageState({
        hasScoreboardElement: false,
        scorebotUrl: null,
        scorebotId: null,
        countdown: null,
        isCountdownLive: false,
        hasDefaultForfeitMapResult: true,
      }).kind
    ).toBe('match_over')
  })

  it('does not treat Default WO + LIVE countdown as match_over without scorebot', () => {
    expect(
      readMatchPageState({
        hasScoreboardElement: false,
        scorebotUrl: null,
        scorebotId: null,
        countdown: 'LIVE',
        isCountdownLive: true,
        hasDefaultForfeitMapResult: true,
      }).kind
    ).toBe('scheduled')
  })

  it('does not treat boards with real rosters as forfeit', () => {
    expect(
      isZombieForfeitScoreboard(
        emptyBoard({
          CT: [
            {
              steamId: '1',
              dbId: 1,
              name: 'a',
              nick: 'alpha',
              score: 0,
              deaths: 0,
              assists: 0,
              alive: true,
              money: 800,
              damagePrRound: 0,
              hp: 100,
              kevlar: false,
              helmet: false,
              hasDefuseKit: false,
            },
          ],
        })
      )
    ).toBe(false)
  })
})
