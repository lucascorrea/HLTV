import {
  isScorebotEventForMatch,
  isSocketTransportFrame,
  shouldBufferScorebotEvent,
} from '../src/scorebot/scorebotStream'

describe('scorebotStream', () => {
  it('detects socket transport keepalive frames', () => {
    expect(isSocketTransportFrame('2')).toBe(true)
    expect(isSocketTransportFrame('3')).toBe(true)
    expect(isSocketTransportFrame('3probe')).toBe(true)
    expect(isSocketTransportFrame('42["scoreboard",{}]')).toBe(false)
  })

  it('buffers scoreboard before socket bootstrap completes', () => {
    expect(
      shouldBufferScorebotEvent('scoreboard', { mapName: 'de_mirage' }, 2394629)
    ).toBe(true)
    expect(
      shouldBufferScorebotEvent('scoreboard', { listId: '999' }, 2394629)
    ).toBe(false)
  })

  it('requires socketReady for listId-less events after bootstrap', () => {
    const payload = { mapName: 'de_mirage' }
    expect(isScorebotEventForMatch('scoreboard', payload, 1, false)).toBe(false)
    expect(isScorebotEventForMatch('scoreboard', payload, 1, true)).toBe(true)
  })
})
