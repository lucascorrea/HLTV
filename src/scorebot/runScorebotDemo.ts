import HLTV from '../index'
import type { LogUpdate, ScoreboardUpdate, WaitForScorebotOptions } from '../endpoints/connectToScorebot'
import {
  printFullLogTable,
  printLogTable,
  printScoreboardTable,
  printUnknownEventTable,
  scoreboardSnapshotKey,
} from './formatScorebotEventTable'
import {
  ScorebotLifecycleTracker,
  formatLifecycleEvent,
} from './scorebotLifecycle'
import { ScorebotSeriesMapsTracker, formatFinalSeriesLine } from './scorebotSeriesMaps'

export type ScorebotDemoFormat = 'table' | 'json' | 'compact'

export type RunScorebotDemoOptions = {
  id: number
  runMs?: number
  format?: ScorebotDemoFormat
  /** Wait for upcoming match scorebot. Default: true */
  waitForScorebot?: boolean | WaitForScorebotOptions
}

const formatPayload = (data: unknown): string => {
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

/** Manual scorebot listener for playground / local websocket checks. */
export const runScorebotDemo = ({
  id,
  runMs,
  format = 'table',
  waitForScorebot = true,
}: RunScorebotDemoOptions): void => {
  console.log(
    runMs
      ? `[scorebot] match=${id} format=${format} wait=${waitForScorebot !== false} auto-stop=${runMs}ms`
      : `[scorebot] match=${id} format=${format} wait=${waitForScorebot !== false} — Ctrl+C to stop`
  )

  const eventCounts = new Map<string, number>()
  const lifecycle = new ScorebotLifecycleTracker()
  const seriesMaps = new ScorebotSeriesMapsTracker()
  let rawCount = 0
  let doneCalled = false
  let lastScoreboardKey = ''
  let lastMapName: string | null = null
  let releaseSession: (() => void) | null = null

  const storeDone = (done: () => void) => {
    releaseSession = done
  }

  const bump = (name: string) => {
    eventCounts.set(name, (eventCounts.get(name) ?? 0) + 1)
    return eventCounts.get(name)!
  }

  const finish = (reason: string) => {
    if (doneCalled) {
      return
    }

    doneCalled = true
    const summary = Array.from(eventCounts.entries())
      .map(([name, count]) => `${name}=${count}`)
      .join(' ')
    console.log(`[scorebot] ${reason} raw=${rawCount}${summary ? ` ${summary}` : ''}`)
    process.exit(0)
  }

  const logLifecycle = (events: ReturnType<ScorebotLifecycleTracker['consumeLog']>) => {
    for (const event of events) {
      console.log(formatLifecycleEvent(event))
    }
  }

  const printEvent = (name: string, data: unknown) => {
    const count = bump(name)

    if (name === 'scoreboard') {
      const board = data as ScoreboardUpdate
      lastMapName = board.mapName
      logLifecycle(lifecycle.consumeScoreboard(board))
    }

    if (name === 'log') {
      logLifecycle(lifecycle.consumeLog(data as LogUpdate, lastMapName))
    }

    if (format === 'compact') {
      console.log(`[event #${count}] ${name}`)
      return
    }

    if (format === 'json') {
      console.log(`[event #${count}] ${name}\n${formatPayload(data)}`)
      return
    }

    if (name === 'scoreboard') {
      const board = data as ScoreboardUpdate
      const key = scoreboardSnapshotKey(board)
      if (key === lastScoreboardKey) {
        return
      }

      lastScoreboardKey = key
      printScoreboardTable(count, board, seriesMaps.getDisplay(board))
      return
    }

    if (name === 'log') {
      printLogTable(count, data as LogUpdate)
      return
    }

    if (name === 'fullLog') {
      printFullLogTable(count, data)
      return
    }

    printUnknownEventTable(count, name, data)
  }

  HLTV.connectToScorebot({
    id,
    waitForScorebot,
    seriesMapsTracker: seriesMaps,
    onStatus: (message) => console.log(`[scorebot] ${message}`),
    onMatchSeriesFinal: (series) => {
      const line = formatFinalSeriesLine(series)
      if (line) {
        console.log(`[scoreboard] ${line}`)
      }
    },
    onMatchPageState: (state, done) => {
      storeDone(done)
      console.log('[page]', state.kind, JSON.stringify(state))
      if (state.kind === 'match_over') {
        console.log('[page] match finished on HLTV — no live scorebot on page')
      }
      if (state.kind === 'scheduled') {
        console.log(`[page] waiting for scorebot — countdown: ${state.countdown}`)
      }
      if (state.kind === 'wait_timeout') {
        console.log(`[page] wait timeout after ${state.waitedMs}ms`)
      }
    },
    onConnect: () => console.log('[scorebot] connected'),
    onDisconnect: () => console.log('[scorebot] disconnected'),
    onScoreboardUpdate: (board, done) => {
      storeDone(done)
      if (board.live === false) {
        console.log(
          `[scoreboard] match ended live=false map=${board.mapName} ${board.counterTerroristScore}-${board.terroristScore}`
        )
      }
    },
    onRawFrame: (payload) => {
      rawCount += 1
      if (format === 'compact') {
        return
      }

      const preview =
        payload.length > 120 ? `${payload.slice(0, 120)}…` : payload
      console.log(`[raw #${rawCount}] ${preview}`)
    },
    onSocketEvent: ({ name, data }, done) => {
      storeDone(done)
      printEvent(name, data)
    },
  })

  if (runMs && runMs > 0) {
    setTimeout(() => finish('timeout'), runMs)
  }

  process.once('SIGINT', () => {
    releaseSession?.()
    finish('stopped')
  })
}
