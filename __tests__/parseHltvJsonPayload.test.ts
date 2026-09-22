import { parseHltvJsonPayload } from '../src/utils'

describe('parseHltvJsonPayload', () => {
  it('parses a raw JSON array', () => {
    expect(parseHltvJsonPayload('[{"teams":[{"id":1}]}]') ).toEqual([
      { teams: [{ id: 1 }] }
    ])
  })

  it('parses JSON wrapped in a FlareSolverr HTML pre', () => {
    const html =
      '<html><body><pre>[{"players":[{"id":11893}]}]</pre></body></html>'
    expect(parseHltvJsonPayload(html)).toEqual([{ players: [{ id: 11893 }] }])
  })

  it('throws on empty body', () => {
    expect(() => parseHltvJsonPayload('   ')).toThrow('Empty HLTV search response')
  })
})
