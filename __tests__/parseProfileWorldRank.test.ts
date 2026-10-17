import { parseProfileWorldRank } from '../src/endpoints/getTeam'

test('keeps the HLTV rank when a regional rank is concatenated', () => {
  expect(parseProfileWorldRank('#3(#1)')).toBe(3)
  expect(parseProfileWorldRank('#6(AM#2)')).toBe(6)
})

test('reads a plain rank cell', () => {
  expect(parseProfileWorldRank('#12')).toBe(12)
  expect(parseProfileWorldRank('  #8 ')).toBe(8)
})

test('returns undefined when the cell has no number', () => {
  expect(parseProfileWorldRank(undefined)).toBeUndefined()
  expect(parseProfileWorldRank('')).toBeUndefined()
  expect(parseProfileWorldRank('Unranked')).toBeUndefined()
})
