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

  it('reads match_over when Default map row has a score on page', () => {
    expect(
      readMatchPageState({
        hasScoreboardElement: true,
        scorebotUrl: 'https://scorebot-lb.hltv.org',
        scorebotId: '2394756',
        countdown: 'LIVE',
        isCountdownLive: true,
        hasDefaultForfeitMapResult: true,
      }).kind
    ).toBe('match_over')
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
