import { parseTeamRankingDevelopment } from '../src/endpoints/parseTeamRankingDevelopment'

test('reads Chart.js HLTV series and skips Valve', () => {
  const chartJs = JSON.stringify({
    data: {
      datasets: [
        {
          data: [
            {
              value: 14,
              tooltip: '<div class="subtitle">12th May 2025</div>',
              link: '/valve-ranking/teams/2025/may/12',
            },
          ],
        },
        {
          data: [
            {
              value: 11,
              tooltip: '<div class="subtitle">19th May 2025</div>',
              link: '/ranking/teams/2025/may/19',
            },
            { category: 'May 25', showLabel: true },
          ],
        },
      ],
    },
  })

  expect(parseTeamRankingDevelopment({ chartJs: [chartJs] })).toEqual([
    { rank: 11, date: '19th May 2025' },
  ])
})

test('falls back to Valve when HLTV series is empty', () => {
  const chartJs = JSON.stringify({
    data: {
      datasets: [
        {
          data: [
            {
              value: 20,
              tooltip: '<div class="subtitle">1st Sep 2026</div>',
              link: '/valve-ranking/teams/2026/september/1',
            },
          ],
        },
      ],
    },
  })
  expect(parseTeamRankingDevelopment({ chartJs: [chartJs] })).toEqual([
    { rank: 20, date: '1st Sep 2026' },
  ])
})

test('falls back to FusionCharts payload', () => {
  const fusion = JSON.stringify({
    dataSource: {
      dataset: [
        {
          data: [
            {
              value: '7',
              tooltext: '<div class="subtitle">3rd Jan 2022</div>',
            },
          ],
        },
      ],
    },
  })
  expect(parseTeamRankingDevelopment({ fusion })).toEqual([
    { rank: 7, date: '3rd Jan 2022' },
  ])
})

test('empty sources yield empty ranking', () => {
  expect(parseTeamRankingDevelopment({})).toEqual([])
  expect(parseTeamRankingDevelopment({ chartJs: ['not-json'] })).toEqual([])
})

test('keeps the longest HLTV series when two charts exist', () => {
  const short = JSON.stringify({
    data: {
      datasets: [
        {
          data: [
            {
              value: 11,
              tooltip: '<div class="subtitle">19th May 2025</div>',
              link: '/ranking/teams/2025/may/19',
            },
          ],
        },
      ],
    },
  })
  const long = JSON.stringify({
    data: {
      datasets: [
        {
          data: [
            {
              value: 4,
              tooltip: '<div class="subtitle">1st February 2016</div>',
              link: '/ranking/teams/2016/february/1',
            },
            {
              value: 11,
              tooltip: '<div class="subtitle">14th September 2026</div>',
              link: '/ranking/teams/2026/september/14',
            },
          ],
        },
      ],
    },
  })
  expect(parseTeamRankingDevelopment({ chartJs: [short, long] })).toEqual([
    { rank: 4, date: '1st February 2016' },
    { rank: 11, date: '14th September 2026' },
  ])
})
