import { generateRandomSuffix, acquirePlaywrightPage } from '../utils'
import { HLTVConfig } from '../config'
import type { Page, WebSocket } from 'playwright-core'
import {
  parseScorebotFrame,
  scorebotPayloadToString,
} from '../scorebot/parseScorebotFrame'
import {
  readMatchPageState,
  type MatchPageState,
} from '../scorebot/matchPageState'
import { ScorebotLiveStateTracker } from '../scorebot/scorebotLiveState'
import { isDecisiveMapRoundScore } from '../scorebot/scorebotLifecycle'
import { scoreboardSnapshotChanged } from '../scorebot/formatScorebotEventTable'
import {
  isScorebotEventForMatch,
  isSocketTransportFrame,
  shouldBufferScorebotEvent,
} from '../scorebot/scorebotStream'
import {
  isZombieForfeitScoreboard,
  logUpdateHasDefaultForfeitSignal,
} from '../scorebot/scorebotForfeit'
import { readSeriesMapWinsFromMatchPage } from '../scorebot/matchPageSeriesMaps'
import {
  ScorebotSeriesMapsTracker,
  type MapsScoreDisplay,
} from '../scorebot/scorebotSeriesMaps'

const MATCH_OVER_POLL_MS = 30_000
/** After a decisive map RoundEnd on the socket, reload HLTV and check DOM. */
const MAP_ENDED_MATCH_OVER_CHECK_MS = 30_000
/** Keep retrying DOM reload until HLTV flips to Match over (bo3 map breaks can lag). */
const MAP_ENDED_MATCH_OVER_MAX_ATTEMPTS = 20

type Side = 'CT' | 'TERRORIST' | 'SPECTATOR'

type LogEvent =
  | RoundStart
  | RoundEnd
  | Restart
  | MatchStarted
  | Kill
  | Assist
  | Suicide
  | BombDefused
  | BombPlanted
  | PlayerJoin
  | PlayerQuit

interface RoundStart {
  RoundStart: {}
}

interface MatchStarted {
  MatchStarted: {
    map: string
  }
}

interface Restart {
  Restart: {}
}

interface PlayerJoin {
  PlayerJoin: {
    playerName: string
    playerNick: string
  }
}

interface PlayerQuit {
  PlayerQuit: {
    playerName: string
    playerNick: string
    playerSide: Side
  }
}

interface RoundEnd {
  RoundEnd: {
    counterTerroristScore: number
    terroristScore: number
    winner: Side
    winType: WinType
  }
}

interface Kill {
  Kill: {
    killerName: string
    killerNick: string
    killerSide: Side
    victimName: string
    victimSide: Side
    victimNick: string
    weapon: string
    headShot: boolean
    eventId: number
    victimX: number
    victimY: number
    killerX: number
    killerY: number
    killerId: number
    victimId: number
    flasherNick?: string
    flasherSide?: Side
  }
}

interface Assist {
  Assist: {
    assisterName: string
    assisterNick: string
    assisterSide: Side
    victimNick: string
    victimName: string
    victimSide: Side
    killEventId: number
  }
}

interface Suicide {
  Suicide: {
    playerName: string
    playerNick: string
    side: Side
    weapon: string
  }
}

interface BombDefused {
  BombDefused: {
    playerName: string
    playerNick: string
  }
}

interface BombPlanted {
  BombPlanted: {
    playerName: string
    playerNick: string
    ctPlayers: number
    tPlayers: number
  }
}

export interface LogUpdate {
  log: LogEvent[]
}

export interface ScoreboardPlayer {
  steamId: string
  dbId: number
  name: string
  score: number
  deaths: number
  assists: number
  alive: boolean
  money: number
  damagePrRound: number
  hp: number
  primaryWeapon?: string
  kevlar: boolean
  helmet: boolean
  nick: string
  hasDefuseKit: boolean
  advancedStats?: {
    kast: number
    entryKills: number
    entryDeaths: number
    multiKillRounds: number
    oneOnXWins: number
    flashAssists: number
    trades?: number
  }
  headshots?: number
  facts?: unknown[]
}

export enum WinType {
  Lost = 'lost',
  TerroristsWin = 'Terrorists_Win',
  CTsWin = 'CTs_Win',
  TargetBombed = 'Target_Bombed',
  BombDefused = 'Bomb_Defused'
}

interface ScoreboardRound {
  type: WinType
  roundOrdinal: number
  survivingPlayers: number
}

export interface ScoreboardUpdate {
  TERRORIST: ScoreboardPlayer[]
  CT: ScoreboardPlayer[]
  ctMatchHistory: {
    firstHalf: ScoreboardRound[]
    secondHalf: ScoreboardRound[]
  }
  terroristMatchHistory: {
    firstHalf: ScoreboardRound[]
    secondHalf: ScoreboardRound[]
  }
  bombPlanted: boolean
  mapName: string
  terroristTeamName: string
  ctTeamName: string
  currentRound: number
  counterTerroristScore: number
  terroristScore: number
  ctTeamId: number
  tTeamId: number
  frozen: boolean
  /** Normalized: true while the match is in progress. */
  live: boolean
  /** Raw HLTV flag (true between rounds, false during active combat). */
  hltvLive?: boolean
  /** Live map round wins for ctTeamId team, or series map wins when side score differs. */
  ctTeamScore: number
  /** Live map round wins for tTeamId team, or series map wins when side score differs. */
  tTeamScore: number
  /** HLTV match team1 id — not a map score. */
  startingCt: number
  /** HLTV match team2 id — not a map score. */
  startingT: number
}

export type { MatchPageState } from '../scorebot/matchPageState'

export type WaitForScorebotOptions = {
  /** Max wait before giving up. Default: 3h */
  timeoutMs?: number
  /** DOM poll interval. Default: 15s */
  pollIntervalMs?: number
  /** Reload match page on this interval while waiting. Default: 60s */
  reloadIntervalMs?: number
}

type ConnectToScorebotParams = {
  id: number
  /** Wait until #scoreboardElement exists (upcoming match). Default: false */
  waitForScorebot?: boolean | WaitForScorebotOptions
  onScoreboardUpdate?: (data: ScoreboardUpdate, done: () => void) => any
  onLogUpdate?: (data: LogUpdate, done: () => void) => any
  onFullLogUpdate?: (data: unknown, done: () => void) => any
  /** Every parsed socket.io event (`scoreboard`, `log`, `fullLog`, etc.). */
  onSocketEvent?: (
    event: { name: string; data: unknown },
    done: () => void
  ) => any
  /** Page has no live scorebot (Match over, postponed, etc.). */
  onMatchPageState?: (state: MatchPageState, done: () => void) => any
  /** Raw Engine.IO frame (ping/pong omitted when `ignorePingFrames` is true). */
  onRawFrame?: (payload: string) => any
  ignorePingFrames?: boolean
  onConnect?: () => any
  onDisconnect?: () => any
  /** Optional status lines for demos (browser boot, stall reload, etc.). */
  onStatus?: (message: string) => void
  /**
   * Skip `onScoreboardUpdate` when the normalized snapshot is unchanged
   * (HLTV often repeats the same scoreboard many times per round). Default: true.
   */
  dedupeScoreboardUpdates?: boolean
  /** Optional tracker updated from page DOM + decisive map RoundEnd events. */
  seriesMapsTracker?: ScorebotSeriesMapsTracker
  /** Fired once when HLTV reports the full match is over (after final page scrape). */
  onMatchSeriesFinal?: (series: MapsScoreDisplay | null) => void
}

const SCOREBOT_HOST = 'scorebot'
const SCOREBOT_DISCONNECT_GRACE_MS = 5_000
const SCOREBOT_STREAM_BOOTSTRAP_MS = 15_000
const SCOREBOT_STREAM_BOOTSTRAP_MAX_ATTEMPTS = 20
const SERIES_MAP_PAGE_SCRAPE_MS = 20_000

const isScorebotSocket = (url: string) => url.includes(SCOREBOT_HOST)

const parseLogPayload = (data: unknown): LogUpdate => {
  if (typeof data === 'string') {
    return JSON.parse(data) as LogUpdate
  }

  return data as LogUpdate
}

const parseSocketEventData = (name: string, data: unknown): unknown => {
  if (name === 'log' || name === 'fullLog') {
    if (typeof data === 'string') {
      return JSON.parse(data)
    }
  }

  return data
}

const isPingFrame = isSocketTransportFrame

const DEFAULT_WAIT_FOR_SCOREBOT: Required<WaitForScorebotOptions> = {
  timeoutMs: 3 * 60 * 60 * 1000,
  pollIntervalMs: 15_000,
  reloadIntervalMs: 60_000,
}

const normalizeWaitForScorebot = (
  value?: boolean | WaitForScorebotOptions
): Required<WaitForScorebotOptions> | null => {
  if (!value) {
    return null
  }

  if (value === true) {
    return DEFAULT_WAIT_FOR_SCOREBOT
  }

  return {
    ...DEFAULT_WAIT_FOR_SCOREBOT,
    ...value,
  }
}

const readPageStateFromDom = async (page: Page) => {
  const pageState = await page.evaluate(() => {
    const scoreboard = document.querySelector('#scoreboardElement')
    const countdownEl = document.querySelector('.countdown')
    const hasDefaultForfeitMapResult = Array.from(
      document.querySelectorAll('.mapholder')
    ).some((el) => {
      const name = el.querySelector('.mapname')?.textContent?.trim().toLowerCase()
      if (name !== 'default') {
        return false
      }

      const left = Number(
        el.querySelector('.results-left .results-team-score')?.textContent?.trim()
      )
      const right = Number(
        el.querySelector('.results-right .results-team-score')?.textContent?.trim()
      )

      return (
        !Number.isNaN(left) &&
        !Number.isNaN(right) &&
        left + right > 0
      )
    })

    return {
      hasScoreboardElement: !!scoreboard,
      scorebotUrl: scoreboard?.getAttribute('data-scorebot-url') ?? null,
      scorebotId: scoreboard?.getAttribute('data-scorebot-id') ?? null,
      countdown: countdownEl?.textContent?.trim() ?? null,
      isCountdownLive: !!document.querySelector('.countdown.countdown-live'),
      hasDefaultForfeitMapResult,
    }
  })

  return readMatchPageState(pageState)
}

const waitForLiveScorebot = async (
  page: Page,
  options: Required<WaitForScorebotOptions>,
  callbacks: {
    onState?: (state: MatchPageState) => void
    onLiveScorebot?: () => void
    isClosed: () => boolean
  }
): Promise<MatchPageState> => {
  const startedAt = Date.now()
  const deadline = startedAt + options.timeoutMs
  let lastReloadAt = Date.now()
  let lastAnnouncedCountdown = ''

  while (Date.now() < deadline) {
    if (callbacks.isClosed() || page.isClosed()) {
      return { kind: 'wait_timeout', waitedMs: Date.now() - startedAt }
    }

    const state = await readPageStateFromDom(page)

    if (state.kind === 'live_scorebot') {
      callbacks.onLiveScorebot?.()
      callbacks.onState?.(state)
      return state
    }

    if (state.kind === 'match_over' || state.kind === 'postponed') {
      callbacks.onState?.(state)
      return state
    }

    const countdown =
      state.kind === 'scheduled' || state.kind === 'unknown'
        ? state.countdown ?? ''
        : ''

    if (countdown !== lastAnnouncedCountdown) {
      lastAnnouncedCountdown = countdown
      callbacks.onState?.(state)
    }

    if (Date.now() - lastReloadAt >= options.reloadIntervalMs) {
      lastReloadAt = Date.now()
      try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
      } catch {
        if (callbacks.isClosed() || page.isClosed()) {
          return { kind: 'wait_timeout', waitedMs: Date.now() - startedAt }
        }
      }
      continue
    }

    try {
      await page.waitForSelector('#scoreboardElement', {
        timeout: options.pollIntervalMs,
      })
    } catch {
      // Keep waiting until timeout.
    }
  }

  return { kind: 'wait_timeout', waitedMs: Date.now() - startedAt }
}

type BufferedScorebotEvent = {
  name: string
  data: unknown
}

export const connectToScorebot =
  (_config: HLTVConfig) =>
  ({
    id,
    waitForScorebot,
    onScoreboardUpdate,
    onLogUpdate,
    onFullLogUpdate,
    onSocketEvent,
    onMatchPageState,
    onRawFrame,
    ignorePingFrames = true,
    onConnect,
    onDisconnect,
    dedupeScoreboardUpdates = true,
    onStatus,
    seriesMapsTracker,
    onMatchSeriesFinal
  }: ConnectToScorebotParams) => {
    void connectToScorebotWithPlaywright({
      id,
      waitForScorebot,
      onScoreboardUpdate,
      onLogUpdate,
      onFullLogUpdate,
      onSocketEvent,
      onMatchPageState,
      onRawFrame,
      ignorePingFrames,
      onConnect,
      onDisconnect,
      dedupeScoreboardUpdates,
      onStatus,
      seriesMapsTracker,
      onMatchSeriesFinal
    })
  }

const connectToScorebotWithPlaywright = async ({
  id,
  waitForScorebot,
  onScoreboardUpdate,
  onLogUpdate,
  onFullLogUpdate,
  onSocketEvent,
  onMatchPageState,
  onRawFrame,
  ignorePingFrames = true,
  onConnect,
  onDisconnect,
  dedupeScoreboardUpdates = true,
  onStatus,
  seriesMapsTracker,
  onMatchSeriesFinal
}: ConnectToScorebotParams) => {
  const status = (message: string) => {
    onStatus?.(message)
  }

  status('opening browser session...')
  const session = await acquirePlaywrightPage()
  const { page } = session
  let closed = false
  let connected = false
  let socketReady = false
  let receivedStreamData = false
  let openScorebotSockets = 0
  let disconnectTimer: ReturnType<typeof setTimeout> | null = null
  let streamBootstrapTimer: ReturnType<typeof setTimeout> | null = null
  let streamBootstrapAttempts = 0
  let lastScoreboard: ScoreboardUpdate | null = null
  let lastEmittedScoreboardKey = ''
  let matchOverPoll: ReturnType<typeof setInterval> | null = null
  let mapEndedCheckTimer: ReturnType<typeof setTimeout> | null = null
  let mapEndedWatchActive = false
  let mapEndedVerifyAttempts = 0
  let matchEndedEmitted = false
  let lastPageSeriesScrapeAt = 0
  let pageSeriesScrapeInFlight = false
  const liveState = new ScorebotLiveStateTracker()
  const preReadyEventBuffer: BufferedScorebotEvent[] = []

  const clearMapEndedCheckTimer = () => {
    if (mapEndedCheckTimer) {
      clearTimeout(mapEndedCheckTimer)
      mapEndedCheckTimer = null
    }
  }

  const logUpdateHasDecisiveMapEnd = (logUpdate: LogUpdate): boolean => {
    for (const entry of logUpdate.log) {
      if (!('RoundEnd' in entry)) {
        continue
      }

      const roundEnd = entry.RoundEnd
      if (
        isDecisiveMapRoundScore(
          roundEnd.counterTerroristScore,
          roundEnd.terroristScore
        )
      ) {
        return true
      }
    }

    return false
  }

  const refreshPageSeriesMapWins = async (force = false) => {
    if (
      !seriesMapsTracker ||
      closed ||
      page.isClosed() ||
      pageSeriesScrapeInFlight
    ) {
      return
    }

    const now = Date.now()
    if (!force && now - lastPageSeriesScrapeAt < SERIES_MAP_PAGE_SCRAPE_MS) {
      return
    }

    pageSeriesScrapeInFlight = true
    try {
      const series = await readSeriesMapWinsFromMatchPage(page)
      lastPageSeriesScrapeAt = Date.now()
      if (series) {
        seriesMapsTracker.notePageSeries(
          series.team1Name,
          series.team1Win,
          series.team2Name,
          series.team2Win
        )
      }
    } catch {
      // Page may be reloading during map-ended watch.
    } finally {
      pageSeriesScrapeInFlight = false
    }
  }

  const noteDecisiveMapEndFromLog = (logUpdate: LogUpdate) => {
    if (!seriesMapsTracker || !lastScoreboard) {
      return
    }

    for (const entry of logUpdate.log) {
      if (!('RoundEnd' in entry)) {
        continue
      }

      const roundEnd = entry.RoundEnd
      if (
        !isDecisiveMapRoundScore(
          roundEnd.counterTerroristScore,
          roundEnd.terroristScore
        )
      ) {
        continue
      }

      seriesMapsTracker.noteMapEnded(roundEnd, lastScoreboard)
    }
  }

  const clearDisconnectTimer = () => {
    if (disconnectTimer) {
      clearTimeout(disconnectTimer)
      disconnectTimer = null
    }
  }

  const scheduleDisconnectIfIdle = () => {
    clearDisconnectTimer()

    if (closed || !receivedStreamData || openScorebotSockets > 0) {
      return
    }

    disconnectTimer = setTimeout(() => {
      if (!closed && receivedStreamData && openScorebotSockets <= 0) {
        closeSession()
      }
    }, SCOREBOT_DISCONNECT_GRACE_MS)
  }

  const clearStreamBootstrapTimer = () => {
    if (streamBootstrapTimer) {
      clearTimeout(streamBootstrapTimer)
      streamBootstrapTimer = null
    }
  }

  const scheduleStreamBootstrap = () => {
    clearStreamBootstrapTimer()

    if (closed || receivedStreamData || !socketReady || page.isClosed()) {
      return
    }

    streamBootstrapTimer = setTimeout(() => {
      void bootstrapScorebotStream()
    }, SCOREBOT_STREAM_BOOTSTRAP_MS)
  }

  const bootstrapScorebotStream = async () => {
    if (
      closed ||
      receivedStreamData ||
      page.isClosed() ||
      streamBootstrapAttempts >= SCOREBOT_STREAM_BOOTSTRAP_MAX_ATTEMPTS
    ) {
      return
    }

    streamBootstrapAttempts += 1
    status(
      `no scoreboard stream yet — reloading page (${streamBootstrapAttempts}/${SCOREBOT_STREAM_BOOTSTRAP_MAX_ATTEMPTS})`
    )

    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
    } catch {
      if (closed || page.isClosed()) {
        return
      }
    }

    if (!closed && !receivedStreamData) {
      scheduleStreamBootstrap()
    }
  }

  const emitMatchEnded = async (pageState?: MatchPageState) => {
    if (matchEndedEmitted) {
      return
    }

    matchEndedEmitted = true
    await refreshPageSeriesMapWins(true)

    if (lastScoreboard && onScoreboardUpdate) {
      const endedBoard = liveState.buildEndedScoreboard(lastScoreboard)
      lastScoreboard = endedBoard
      const { key } = scoreboardSnapshotChanged('', endedBoard)
      lastEmittedScoreboardKey = key
      onScoreboardUpdate(endedBoard, done)
    }

    if (seriesMapsTracker && onMatchSeriesFinal) {
      onMatchSeriesFinal(seriesMapsTracker.getFinalDisplay())
    }

    if (pageState && onMatchPageState) {
      onMatchPageState(pageState, done)
    }
  }

  const stopMapEndedWatch = () => {
    mapEndedWatchActive = false
    mapEndedVerifyAttempts = 0
    clearMapEndedCheckTimer()
  }

  const inspectMatchOverFromPage = async (
    reload: boolean
  ): Promise<MatchPageState | null> => {
    if (closed || page.isClosed()) {
      return null
    }

    if (reload) {
      try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
      } catch {
        if (closed || page.isClosed()) {
          return null
        }
      }
    }

    return readPageStateFromDom(page)
  }

  const handleMatchPageStateAfterMapEnded = (state: MatchPageState) => {
    if (state.kind === 'match_over') {
      stopMapEndedWatch()
      void emitMatchEnded(state)
      closeSession()
      return
    }

    if (state.kind === 'postponed') {
      stopMapEndedWatch()
      if (onMatchPageState) {
        onMatchPageState(state, done)
      }
      closeSession()
    }
  }

  const checkMatchOverFromPage = async () => {
    if (closed || matchEndedEmitted || page.isClosed()) {
      return
    }

    try {
      const state = await inspectMatchOverFromPage(mapEndedWatchActive)
      if (!state) {
        return
      }

      if (state.kind === 'match_over') {
        stopMapEndedWatch()
        void emitMatchEnded(state)
        closeSession()
      }
    } catch {
      // Page may be navigating; ignore transient read errors.
    }
  }

  const markStreamConnected = () => {
    receivedStreamData = true
    clearDisconnectTimer()
    clearStreamBootstrapTimer()
    streamBootstrapAttempts = 0

    if (!connected) {
      connected = true
      void refreshPageSeriesMapWins(true)
      if (onConnect) {
        onConnect()
      }
    }
  }

  const closeSession = () => {
    if (closed) {
      return
    }

    closed = true
    clearDisconnectTimer()
    clearStreamBootstrapTimer()
    stopMapEndedWatch()
    if (matchOverPoll) {
      clearInterval(matchOverPoll)
      matchOverPoll = null
    }
    if (onDisconnect) {
      onDisconnect()
    }
    void session.release()
  }

  const done = closeSession

  const verifyMatchOverAfterMapEnded = async () => {
    if (closed || matchEndedEmitted || page.isClosed() || !mapEndedWatchActive) {
      return
    }

    mapEndedVerifyAttempts += 1

    try {
      const state = await inspectMatchOverFromPage(true)
      await refreshPageSeriesMapWins(true)
      if (!state) {
        return
      }

      if (state.kind === 'match_over' || state.kind === 'postponed') {
        handleMatchPageStateAfterMapEnded(state)
        return
      }

      // Series may still be in progress (bo3 map break), or HLTV page not updated yet.
      if (mapEndedVerifyAttempts >= MAP_ENDED_MATCH_OVER_MAX_ATTEMPTS) {
        stopMapEndedWatch()
        return
      }

      scheduleMatchOverCheckAfterMapEnded()
    } catch {
      if (
        !closed &&
        !matchEndedEmitted &&
        mapEndedWatchActive &&
        mapEndedVerifyAttempts < MAP_ENDED_MATCH_OVER_MAX_ATTEMPTS
      ) {
        scheduleMatchOverCheckAfterMapEnded()
      }
    }
  }

  const scheduleMatchOverCheckAfterMapEnded = () => {
    if (closed || matchEndedEmitted || !mapEndedWatchActive) {
      return
    }

    clearMapEndedCheckTimer()
    mapEndedCheckTimer = setTimeout(() => {
      mapEndedCheckTimer = null
      void verifyMatchOverAfterMapEnded()
    }, MAP_ENDED_MATCH_OVER_CHECK_MS)
  }

  const startMapEndedWatch = () => {
    if (closed || matchEndedEmitted) {
      return
    }

    mapEndedWatchActive = true
    scheduleMatchOverCheckAfterMapEnded()
  }

  const normalizeScoreboardEvent = (raw: ScoreboardUpdate): ScoreboardUpdate => {
    const normalized = liveState.normalizeScoreboard(raw)
    lastScoreboard = normalized
    return normalized
  }

  const handleScorebotEvent = (eventName: string, rawData: unknown) => {
    const data = parseSocketEventData(eventName, rawData)
    let eventData: unknown = data

    if (eventName === 'scoreboard') {
      eventData = normalizeScoreboardEvent(data as ScoreboardUpdate)
      markStreamConnected()
    }

    if (onSocketEvent) {
      onSocketEvent({ name: eventName, data: eventData }, done)
    }

    if (eventName === 'scoreboard') {
      const board = eventData as ScoreboardUpdate
      if (isZombieForfeitScoreboard(board)) {
        startMapEndedWatch()
      }
      void refreshPageSeriesMapWins()
      if (onScoreboardUpdate) {
        const { key, changed } = scoreboardSnapshotChanged(
          lastEmittedScoreboardKey,
          board
        )
        if (!dedupeScoreboardUpdates || changed) {
          lastEmittedScoreboardKey = key
          onScoreboardUpdate(board, done)
        }
      }
      return
    }

    if (eventName === 'log') {
      markStreamConnected()
      const logUpdate = data as LogUpdate
      if (
        logUpdateHasDecisiveMapEnd(logUpdate) ||
        logUpdateHasDefaultForfeitSignal(logUpdate)
      ) {
        noteDecisiveMapEndFromLog(logUpdate)
        void refreshPageSeriesMapWins(true)
        startMapEndedWatch()
      }
      if (onLogUpdate) {
        onLogUpdate(logUpdate, done)
      }
      return
    }

    if (eventName === 'fullLog') {
      markStreamConnected()
      if (onFullLogUpdate) {
        onFullLogUpdate(data, done)
      }
    }
  }

  const flushPreReadyEventBuffer = () => {
    if (preReadyEventBuffer.length === 0) {
      return
    }

    const buffered = preReadyEventBuffer.splice(0)
    for (const event of buffered) {
      if (
        !isScorebotEventForMatch(event.name, event.data, id, true)
      ) {
        continue
      }

      handleScorebotEvent(event.name, event.data)
    }
  }

  const enableSocketStream = () => {
    if (socketReady) {
      return
    }

    socketReady = true
    flushPreReadyEventBuffer()
    status('scorebot page ready — waiting for stream data...')
    scheduleStreamBootstrap()
  }

  page.on('close', closeSession)

  page.on('websocket', (websocket: WebSocket) => {
    if (!isScorebotSocket(websocket.url())) {
      return
    }

    openScorebotSockets += 1
    clearDisconnectTimer()

    if (socketReady && !receivedStreamData) {
      scheduleStreamBootstrap()
    }

    websocket.on('framereceived', (frame: { payload: string | Buffer }) => {
      const payload = scorebotPayloadToString(frame.payload as string | Buffer)
      const events = parseScorebotFrame(payload)

      if (
        onRawFrame &&
        socketReady &&
        events.length === 0 &&
        (!ignorePingFrames || !isPingFrame(payload))
      ) {
        onRawFrame(payload)
      }

      for (const event of events) {
        if (!socketReady) {
          if (shouldBufferScorebotEvent(event.name, event.data, id)) {
            preReadyEventBuffer.push({ name: event.name, data: event.data })
          }
          continue
        }

        if (!isScorebotEventForMatch(event.name, event.data, id, socketReady)) {
          continue
        }

        handleScorebotEvent(event.name, event.data)
      }
    })

    websocket.on('close', () => {
      openScorebotSockets = Math.max(0, openScorebotSockets - 1)

      if (!socketReady || closed || !receivedStreamData) {
        return
      }

      scheduleDisconnectIfIdle()
    })
  })

  try {
    status('loading HLTV match page...')
    await page.goto(
      `https://www.hltv.org/matches/${id}/${generateRandomSuffix()}`,
      { waitUntil: 'domcontentloaded', timeout: 60000 }
    )

    let matchPageState = await readPageStateFromDom(page)
    if (onMatchPageState) {
      onMatchPageState(matchPageState, done)
    }
    const waitOptions = normalizeWaitForScorebot(waitForScorebot)

    if (matchPageState.kind !== 'live_scorebot') {
      if (
        matchPageState.kind === 'match_over' ||
        matchPageState.kind === 'postponed'
      ) {
        if (onMatchPageState) {
          onMatchPageState(matchPageState, done)
        }

        closeSession()
        return
      }

      if (!waitOptions) {
        if (onMatchPageState) {
          onMatchPageState(matchPageState, done)
        }

        closeSession()
        return
      }

      matchPageState = await waitForLiveScorebot(page, waitOptions, {
        onState: (state) => {
          if (onMatchPageState) {
            onMatchPageState(state, done)
          }
        },
        onLiveScorebot: () => {
          enableSocketStream()
        },
        isClosed: () => closed,
      })

      if (matchPageState.kind !== 'live_scorebot') {
        closeSession()
        return
      }
    }

    enableSocketStream()

    matchOverPoll = setInterval(() => {
      void checkMatchOverFromPage()
    }, MATCH_OVER_POLL_MS)

    await page.waitForTimeout(1500)
  } catch (error) {
    closeSession()
    throw error
  }
}
