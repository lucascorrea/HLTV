const STREAM_EVENT_NAMES = ['scoreboard', 'log', 'fullLog'] as const

export type ScorebotStreamEventName = (typeof STREAM_EVENT_NAMES)[number]

/** Engine.IO / Socket.IO keepalive frames — not game payloads. */
export const isSocketTransportFrame = (payload: string): boolean =>
  payload === '2' ||
  payload === '3' ||
  /^[23]probe$/.test(payload)

export const scorebotEventListId = (data: unknown): string | null => {
  if (!data || typeof data !== 'object' || !('listId' in data)) {
    return null
  }

  return String((data as { listId: unknown }).listId)
}

export const isScorebotStreamEventName = (
  eventName: string
): eventName is ScorebotStreamEventName =>
  (STREAM_EVENT_NAMES as readonly string[]).includes(eventName)

/** Buffer stream events that arrive before Playwright finishes page bootstrap. */
export const shouldBufferScorebotEvent = (
  eventName: string,
  data: unknown,
  matchId: number
): boolean => {
  if (!isScorebotStreamEventName(eventName)) {
    return false
  }

  const listId = scorebotEventListId(data)
  if (listId !== null) {
    return listId === String(matchId)
  }

  return true
}

export const isScorebotEventForMatch = (
  eventName: string,
  data: unknown,
  matchId: number,
  socketReady: boolean
): boolean => {
  const listId = scorebotEventListId(data)
  if (listId !== null) {
    return listId === String(matchId)
  }

  return socketReady && isScorebotStreamEventName(eventName)
}
