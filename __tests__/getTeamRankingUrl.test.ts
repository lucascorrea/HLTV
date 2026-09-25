import { buildTeamRankingUrl } from '../src/endpoints/getTeamRanking'

test('latest ranking omits empty path segments', () => {
  expect(buildTeamRankingUrl()).toBe('https://www.hltv.org/ranking/teams/')
})

test('dated ranking keeps only provided segments', () => {
  expect(buildTeamRankingUrl({ year: 2022, month: 'september', day: 21 })).toBe(
    'https://www.hltv.org/ranking/teams/2022/september/21'
  )
  expect(buildTeamRankingUrl({ year: 2022, month: 'september' })).toBe(
    'https://www.hltv.org/ranking/teams/2022/september'
  )
  expect(buildTeamRankingUrl({ year: 2022 })).toBe(
    'https://www.hltv.org/ranking/teams/2022'
  )
})

test('day without month does not emit an empty segment', () => {
  expect(buildTeamRankingUrl({ year: 2022, day: 21 })).toBe(
    'https://www.hltv.org/ranking/teams/2022'
  )
})
