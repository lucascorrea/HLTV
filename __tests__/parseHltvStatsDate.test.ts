import { parseHltvStatsDate } from '../src/utils'

test('parseHltvStatsDate uses UTC date-only (no local TZ day shift)', () => {
  const ts = parseHltvStatsDate('23/05/26')
  expect(new Date(ts).toISOString()).toBe('2026-05-23T00:00:00.000Z')
})

test('parseHltvStatsDate handles 4-digit year', () => {
  const ts = parseHltvStatsDate('21/05/2026')
  expect(new Date(ts).toISOString()).toBe('2026-05-21T00:00:00.000Z')
})
