import { cookieHeaderForHost, cookieMatchesHost } from '../src/flarePage'
import { fetchLiveScoreboardSnapshot } from '../src/scorebot/fetchLiveScoreboardSnapshot'

describe('flarePage cookies', () => {
  it('matches subdomain cookies onto scorebot host', () => {
    expect(cookieMatchesHost('.hltv.org', 'scorebot-lb.hltv.org')).toBe(true)
    expect(cookieMatchesHost('www.hltv.org', 'scorebot-lb.hltv.org')).toBe(true)
    expect(cookieMatchesHost(undefined, 'scorebot-lb.hltv.org')).toBe(true)
    expect(cookieMatchesHost('example.com', 'scorebot-lb.hltv.org')).toBe(false)
    expect(
      cookieHeaderForHost(
        [
          { name: 'cf_clearance', value: 'abc', domain: '.hltv.org' },
          { name: '__cflb', value: 'www', domain: 'www.hltv.org' }
        ],
        'scorebot-lb.hltv.org'
      )
    ).toBe('cf_clearance=abc; __cflb=www')
  })

  it('returns empty header without cookies', () => {
    expect(cookieHeaderForHost([], 'scorebot-lb.hltv.org')).toBe('')
  })
})

describe('fetchLiveScoreboardSnapshot', () => {
  it('returns null without cookies or user agent', async () => {
    await expect(
      fetchLiveScoreboardSnapshot({
        scorebotUrl: 'https://scorebot-lb.hltv.org',
        scorebotId: '2397824',
        cookies: [],
        userAgent: 'Mozilla/5.0'
      })
    ).resolves.toBeNull()
    await expect(
      fetchLiveScoreboardSnapshot({
        scorebotUrl: 'https://scorebot-lb.hltv.org',
        scorebotId: '2397824',
        cookies: [{ name: 'cf_clearance', value: 'x', domain: '.hltv.org' }],
        userAgent: ''
      })
    ).resolves.toBeNull()
  })
})
