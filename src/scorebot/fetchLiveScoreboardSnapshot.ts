import io from 'socket.io-client'
import { cookieHeaderForHost, type FlareCookie } from '../flarePage'

export type ScorebotSnapshotBoard = {
  mapName?: string
  ctTeamName?: string
  terroristTeamName?: string
  counterTerroristScore?: number
  terroristScore?: number
  currentRound?: number
  live?: boolean
}

const DEFAULT_TIMEOUT_MS = 8_000

const snapshotTimeoutMs = (): number => {
  const n = Number(process.env.HLTV_SCOREBOT_SNAPSHOT_MS || DEFAULT_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS
}

const scorebotHostFromUrl = (scorebotUrl: string): string => {
  try {
    return new URL(scorebotUrl).hostname
  } catch {
    return 'scorebot-lb.hltv.org'
  }
}

/**
 * One scoreboard frame via Socket.IO `readyForMatch`.
 * scorebot-lb is Cloudflare-gated — pass FlareSolverr cookies + UA from the match fetch.
 */
export const fetchLiveScoreboardSnapshot = ({
  scorebotUrl,
  scorebotId,
  cookies,
  userAgent,
  timeoutMs = snapshotTimeoutMs()
}: {
  scorebotUrl: string
  scorebotId: string
  cookies?: FlareCookie[]
  userAgent?: string
  timeoutMs?: number
}): Promise<ScorebotSnapshotBoard | null> => {
  const url = String(scorebotUrl || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .pop()
  const listId = String(scorebotId || '').trim()
  if (!url || !listId) {
    return Promise.resolve(null)
  }

  const host = scorebotHostFromUrl(url)
  const cookie = cookieHeaderForHost(cookies, host)
  const ua = String(userAgent || '').trim()
  if (!cookie || !ua) {
    return Promise.resolve(null)
  }

  const headers = {
    'User-Agent': ua,
    Cookie: cookie,
    Origin: 'https://www.hltv.org',
    Referer: 'https://www.hltv.org/'
  }

  return new Promise((resolve) => {
    let settled = false
    const socket = io.connect(url, {
      forceNew: true,
      reconnection: false,
      timeout: timeoutMs,
      extraHeaders: headers,
      transportOptions: {
        polling: { extraHeaders: headers }
      }
    } as never)

    const finish = (board: ScorebotSnapshotBoard | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        socket.disconnect()
      } catch {
        /* Node 23 + engine.io close() can stack-overflow */
      }
      resolve(board)
    }

    const timer = setTimeout(() => finish(null), timeoutMs)

    socket.on('connect', () => {
      socket.emit(
        'readyForMatch',
        JSON.stringify({ token: '', listId })
      )
    })
    socket.on('connect_error', () => finish(null))
    socket.on('error', () => finish(null))
    socket.on('scoreboard', (data: ScorebotSnapshotBoard) => {
      finish(data && typeof data === 'object' ? data : null)
    })
  })
}
