import {
  parseScorebotFrame,
  scorebotPayloadToString,
} from '../src/scorebot/parseScorebotFrame'

describe('parseScorebotFrame', () => {
  it('parses scoreboard events', () => {
    const payload =
      '42["scoreboard",{"mapName":"de_overpass","counterTerroristScore":11,"terroristScore":11}]'

    const events = parseScorebotFrame(payload)

    expect(events).toHaveLength(1)
    expect(events[0].name).toBe('scoreboard')
    expect(events[0].data).toMatchObject({
      mapName: 'de_overpass',
      counterTerroristScore: 11,
      terroristScore: 11,
    })
  })

  it('parses log events with stringified payload', () => {
    const payload =
      '42["log","{\\"log\\":[{\\"Kill\\":{\\"killerNick\\":\\"xeedo\\"}}]}"]'

    const events = parseScorebotFrame(payload)

    expect(events).toHaveLength(1)
    expect(events[0].name).toBe('log')
    expect(typeof events[0].data).toBe('string')
  })

  it('ignores ping/pong packets', () => {
    const payload = '3'

    expect(parseScorebotFrame(payload)).toEqual([])
  })

  it('converts buffer payloads to text', () => {
    const payload = Buffer.from('42["scoreboard",{"live":true}]', 'utf8')

    expect(scorebotPayloadToString(payload)).toContain('scoreboard')
  })
})
