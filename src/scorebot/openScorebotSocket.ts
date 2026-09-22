import io from 'socket.io-client'
import { cookieHeaderForHost, type FlareCookie } from '../flarePage'

export type OpenScorebotSocketHandle = {
  close: () => void
  emitReady: () => void
}

const scorebotHostFromUrl = (scorebotUrl: string): string => {
  try {
    return new URL(scorebotUrl).hostname
  } catch {
    return 'scorebot-lb.hltv.org'
  }
}

export const resolveScorebotUrl = (scorebotUrl: string): string | null => {
  const url = String(scorebotUrl || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .pop()
  return url || null
}

/**
 * Persistent Socket.IO session to scorebot-lb (Cloudflare-gated).
 * Pass FlareSolverr cookies + UA from the match-page fetch — same as
 * `fetchLiveScoreboardSnapshot`, but stays open and forwards events.
 */
export const openScorebotSocket = ({
  scorebotUrl,
  scorebotId,
  cookies,
  userAgent,
  reconnection = true,
  onEvent,
  onOpen,
  onClose,
  onError
}: {
  scorebotUrl: string
  scorebotId: string
  cookies?: FlareCookie[]
  userAgent?: string
  reconnection?: boolean
  onEvent: (name: string, data: unknown) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (err: unknown) => void
}): OpenScorebotSocketHandle | null => {
  const url = resolveScorebotUrl(scorebotUrl)
  const listId = String(scorebotId || '').trim()
  if (!url || !listId) {
    return null
  }

  const host = scorebotHostFromUrl(url)
  const cookie = cookieHeaderForHost(cookies, host)
  const ua = String(userAgent || '').trim()
  if (!cookie || !ua) {
    return null
  }

  const headers = {
    'User-Agent': ua,
    Cookie: cookie,
    Origin: 'https://www.hltv.org',
    Referer: 'https://www.hltv.org/'
  }

  const socket = io.connect(url, {
    forceNew: true,
    reconnection,
    timeout: 20_000,
    extraHeaders: headers,
    transportOptions: {
      polling: { extraHeaders: headers }
    }
  } as never)

  const emitReady = () => {
    socket.emit('readyForMatch', JSON.stringify({ token: '', listId }))
  }

  socket.on('connect', () => {
    onOpen?.()
    emitReady()
  })
  socket.on('disconnect', () => {
    onClose?.()
  })
  socket.on('connect_error', (err: unknown) => {
    onError?.(err)
  })
  socket.on('error', (err: unknown) => {
    onError?.(err)
  })
  socket.on('scoreboard', (data: unknown) => onEvent('scoreboard', data))
  socket.on('log', (data: unknown) => onEvent('log', data))
  socket.on('fullLog', (data: unknown) => onEvent('fullLog', data))

  return {
    emitReady,
    close: () => {
      try {
        socket.disconnect()
      } catch {
        /* Node 23 + engine.io close() can stack-overflow */
      }
    }
  }
}
