import {
  isDecisiveMapRoundScore,
  ScorebotLifecycleTracker,
  formatLifecycleEvent,
} from '../src/scorebot/scorebotLifecycle'
import { readMatchPageState, isMatchOverCountdown } from '../src/scorebot/matchPageState'
import { WinType } from '../src/endpoints/connectToScorebot'

describe('scorebotLifecycle', () => {
  it('detects decisive map score', () => {
    expect(isDecisiveMapRoundScore(13, 2)).toBe(true)
    expect(isDecisiveMapRoundScore(12, 12)).toBe(false)
  })

  it('emits map_ended on decisive RoundEnd log', () => {
    const tracker = new ScorebotLifecycleTracker()
    const events = tracker.consumeLog(
      {
        log: [
          {
            RoundEnd: {
              counterTerroristScore: 13,
              terroristScore: 2,
              winner: 'CT',
              winType: WinType.CTsWin,
            },
          },
        ],
      },
      'de_overpass'
    )

    expect(events.some((e) => e.type === 'map_ended')).toBe(true)
    expect(formatLifecycleEvent(events[0])).toContain('MAP ENDED')
  })
})

describe('matchPageState', () => {
  it('detects match over without scoreboard', () => {
    expect(
      readMatchPageState({
        hasScoreboardElement: false,
        scorebotUrl: null,
        scorebotId: null,
        countdown: 'Match over',
        isCountdownLive: false,
      }).kind
    ).toBe('match_over')
  })

  it('prefers match over when countdown says so even if scorebot attrs remain', () => {
    expect(
      readMatchPageState({
        hasScoreboardElement: true,
        scorebotUrl: 'https://scorebot-lb.hltv.org',
        scorebotId: '2394622',
        countdown: 'Match over',
        isCountdownLive: false,
      }).kind
    ).toBe('match_over')
  })

  it('uses scorebot id from element when present', () => {
    const state = readMatchPageState({
      hasScoreboardElement: true,
      scorebotUrl: 'https://scorebot-lb.hltv.org',
      scorebotId: '2394622',
      countdown: 'LIVE',
      isCountdownLive: true,
    })

    expect(state).toMatchObject({
      kind: 'live_scorebot',
      scorebotId: '2394622',
    })
  })

  it('isMatchOverCountdown accepts HLTV variants', () => {
    expect(isMatchOverCountdown('Match over')).toBe(true)
    expect(isMatchOverCountdown('Match Over')).toBe(true)
    expect(isMatchOverCountdown('  Match over  ')).toBe(true)
    expect(isMatchOverCountdown('LIVE')).toBe(false)
  })
})
