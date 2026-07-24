export type ParsedScorebotEvent = {
  name: string
  data: unknown
}

const isDigit = (char: string) => char >= '0' && char <= '9'

/** Converts Playwright websocket payload to UTF-8 text. */
export const scorebotPayloadToString = (payload: string | Buffer): string =>
  typeof payload === 'string' ? payload : payload.toString('utf8')

/**
 * Parses Engine.IO v3 / Socket.IO v2 websocket frames emitted by HLTV scorebot.
 * Example: 42["scoreboard",{"mapName":"de_overpass"}]
 */
export const parseScorebotFrame = (
  payload: string
): ParsedScorebotEvent[] => {
  const events: ParsedScorebotEvent[] = []
  let index = 0

  while (index < payload.length) {
    if (!isDigit(payload[index])) {
      index += 1
      continue
    }

    const engineType = Number(payload[index])
    index += 1

    if (engineType === 2 || engineType === 3 || engineType === 6) {
      continue
    }

    if (engineType === 4) {
      if (index >= payload.length || !isDigit(payload[index])) {
        break
      }

      const socketType = Number(payload[index])
      index += 1

      if (socketType === 2) {
        const jsonStart = payload.indexOf('[', index)
        if (jsonStart === -1) {
          break
        }

        const jsonEnd = findMatchingBracket(payload, jsonStart, '[', ']')
        if (jsonEnd === -1) {
          break
        }

        const parsed = JSON.parse(payload.slice(jsonStart, jsonEnd + 1)) as [
          string,
          unknown
        ]
        events.push({ name: parsed[0], data: parsed[1] })
        index = jsonEnd + 1
        continue
      }

      if (socketType === 0 || socketType === 1) {
        continue
      }

      break
    }

    if (engineType === 0) {
      const jsonStart = payload.indexOf('{', index)
      if (jsonStart === -1) {
        break
      }

      const jsonEnd = findMatchingBracket(payload, jsonStart, '{', '}')
      if (jsonEnd === -1) {
        break
      }

      index = jsonEnd + 1
      continue
    }

    break
  }

  return events
}

const findMatchingBracket = (
  source: string,
  start: number,
  open: string,
  close: string
): number => {
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < source.length; i += 1) {
    const char = source[i]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }

      if (char === '\\') {
        escaped = true
        continue
      }

      if (char === '"') {
        inString = false
      }

      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === open) {
      depth += 1
      continue
    }

    if (char === close) {
      depth -= 1
      if (depth === 0) {
        return i
      }
    }
  }

  return -1
}
