import { shouldRetryTeamStatsMatchesFetch } from '../src/endpoints/getTeamStats'

describe('shouldRetryTeamStatsMatchesFetch', () => {
  it('does not retry a complete small career (5 maps / 5 rows)', () => {
    expect(shouldRetryTeamStatsMatchesFetch(5, 5)).toBe(false)
  })

  it('does not retry matching counts under the established threshold', () => {
    expect(shouldRetryTeamStatsMatchesFetch(24, 24)).toBe(false)
  })

  it('does not retry a known-empty career', () => {
    expect(shouldRetryTeamStatsMatchesFetch(0, 0)).toBe(false)
  })

  it('retries when overview has maps but the matches table is empty', () => {
    expect(shouldRetryTeamStatsMatchesFetch(0, 80)).toBe(true)
  })

  it('retries when an established team table is far below overview mapsPlayed', () => {
    expect(shouldRetryTeamStatsMatchesFetch(5, 200)).toBe(true)
  })
})
