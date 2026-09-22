import { openScorebotSocket, resolveScorebotUrl } from '../src/scorebot/openScorebotSocket'

describe('openScorebotSocket', () => {
  it('picks the last scorebot URL from a comma list', () => {
    expect(
      resolveScorebotUrl('https://scorebot1.hltv.org, https://scorebot-lb.hltv.org')
    ).toBe('https://scorebot-lb.hltv.org')
  })

  it('returns null without cookies or user agent', () => {
    expect(
      openScorebotSocket({
        scorebotUrl: 'https://scorebot-lb.hltv.org',
        scorebotId: '2398104',
        cookies: [],
        userAgent: 'Mozilla/5.0',
        onEvent: () => {}
      })
    ).toBeNull()
    expect(
      openScorebotSocket({
        scorebotUrl: 'https://scorebot-lb.hltv.org',
        scorebotId: '2398104',
        cookies: [{ name: 'cf_clearance', value: 'x', domain: '.hltv.org' }],
        userAgent: '',
        onEvent: () => {}
      })
    ).toBeNull()
  })
})
