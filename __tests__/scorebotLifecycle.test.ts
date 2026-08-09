import {
  isDecisiveMapRoundScore,
  ScorebotLifecycleTracker,
  formatLifecycleEvent,
} from '../src/scorebot/scorebotLifecycle'
import { readMatchPageState, isMatchOverCountdown } from '../src/scorebot/matchPageState'
import { WinType } from '../src/endpoints/connectToScorebot'

describe('scorebotLifecycle', () => {
  it('detects decisive map score (MR12 regulation + MR3 OT)', () => {
    // Regulation: first to 13 before OT (13-11 max opponent in reg)
    expect(isDecisiveMapRoundScore(13, 2)).toBe(true)
    expect(isDecisiveMapRoundScore(13, 11)).toBe(true)
    expect(isDecisiveMapRoundScore(12, 12)).toBe(false)

    // Early OT — still playing (must not start mapEndedWatch)
    expect(isDecisiveMapRoundScore(13, 12)).toBe(false)
    expect(isDecisiveMapRoundScore(14, 12)).toBe(false)
    expect(isDecisiveMapRoundScore(14, 13)).toBe(false)
    expect(isDecisiveMapRoundScore(15, 13)).toBe(false)
    expect(isDecisiveMapRoundScore(15, 14)).toBe(false)
    expect(isDecisiveMapRoundScore(15, 15)).toBe(false)

    // OT finished — period start 12/15/18… need +4 and win-by-2
    expect(isDecisiveMapRoundScore(16, 14)).toBe(true)
    expect(isDecisiveMapRoundScore(16, 15)).toBe(false)
    expect(isDecisiveMapRoundScore(17, 16)).toBe(false)
    expect(isDecisiveMapRoundScore(19, 18)).toBe(false)
    expect(isDecisiveMapRoundScore(19, 17)).toBe(true)
    expect(isDecisiveMapRoundScore(18, 18)).toBe(false)
    expect(isDecisiveMapRoundScore(21, 19)).toBe(false)
    expect(isDecisiveMapRoundScore(22, 20)).toBe(true)
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
