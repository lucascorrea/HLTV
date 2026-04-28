import { Agent as HttpsAgent } from 'https'
import { Agent as HttpAgent } from 'http'
import axios from 'axios'
import { chromium } from 'playwright-extra'
import stealth from 'puppeteer-extra-plugin-stealth'

// Configure playwright with stealth plugin
chromium.use(stealth())

let browser: any = null

async function getBrowser() {
  if (browser && browser.isConnected()) {
    return browser
  }

  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280x720',
      '--disable-extensions',
      '--no-first-run',
      '--disable-blink-features=AutomationControlled',
    ],
    timeout: 30000
  })

  browser.on('disconnected', () => {
    browser = null
  })

  return browser
}

export interface FlareSolverrLoadPageOptions {
  /** Ex.: http://127.0.0.1:8191 — default: FLARESOLVERR_URL ou 127.0.0.1:8191 */
  flareSolverrUrl?: string
  maxTimeoutMs?: number
  /** Reusa sessão do FlareSolverr para reduzir churn de processos Chromium. */
  reuseSession?: boolean
  /** Sessão é reciclada após N requests para evitar acúmulo de estado. */
  recycleSessionAfterRequests?: number
  /** TTL da sessão no FlareSolverr (minutos). */
  sessionTtlMinutes?: number
  /** Destroi sessão após ficar ociosa por este período (ms). */
  destroySessionAfterIdleMs?: number
}

/** HTML via FlareSolverr (`POST .../v1`, cmd request.get). Use em rotas /stats/ bloqueadas no Playwright. */
export const defaultLoadPageFlareSolverr = (
  options: FlareSolverrLoadPageOptions = {}
): ((url: string) => Promise<string>) => {
  const base = (
    options.flareSolverrUrl ||
    process.env.FLARESOLVERR_URL ||
    'http://127.0.0.1:8191'
  ).replace(/\/$/, '')
  const maxTimeout =
    options.maxTimeoutMs ??
    Number(process.env.FLARESOLVERR_TIMEOUT_MS || 120000)
  const reuseSession = options.reuseSession ?? true
  const recycleSessionAfterRequests = Math.max(
    1,
    options.recycleSessionAfterRequests ??
      Number(process.env.FLARESOLVERR_RECYCLE_AFTER_REQUESTS || 60)
  )
  const sessionTtlMinutes = Math.max(
    1,
    options.sessionTtlMinutes ??
      Number(process.env.FLARESOLVERR_SESSION_TTL_MINUTES || 8)
  )
  const destroySessionAfterIdleMs = Math.max(
    10_000,
    options.destroySessionAfterIdleMs ??
      Number(process.env.FLARESOLVERR_DESTROY_IDLE_MS || 120000)
  )
  // Logs de sessão ativos por padrão; pode desativar com FLARESOLVERR_SESSION_LOGS=false.
  const sessionLogsEnabled =
    String(process.env.FLARESOLVERR_SESSION_LOGS || 'true')
      .trim()
      .toLowerCase() !== 'false'

  const logSession = (message: string) => {
    if (!sessionLogsEnabled) return
    console.log(`[FlareSolverrSession] ${message}`)
  }

  let currentSessionId: string | null = null
  let sessionCreatePromise: Promise<string> | null = null
  let requestsInCurrentSession = 0
  let idleDestroyTimer: NodeJS.Timeout | null = null

  const clearIdleTimer = () => {
    if (!idleDestroyTimer) return
    clearTimeout(idleDestroyTimer)
    idleDestroyTimer = null
  }

  const destroySession = async (sessionId: string | null): Promise<void> => {
    if (!sessionId) return
    try {
      logSession(`destroy start session=${sessionId}`)
      await axios.post(
        `${base}/v1`,
        { cmd: 'sessions.destroy', session: sessionId },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: maxTimeout,
          validateStatus: () => true,
        }
      )
      logSession(`destroy ok session=${sessionId}`)
    } catch {
      // Best-effort cleanup: session pode já ter expirado no FlareSolverr.
      logSession(`destroy skipped/failed session=${sessionId}`)
    }
  }

  const scheduleIdleDestroy = () => {
    if (!reuseSession) return
    clearIdleTimer()
    idleDestroyTimer = setTimeout(async () => {
      const sessionToDestroy = currentSessionId
      currentSessionId = null
      requestsInCurrentSession = 0
      logSession(`idle timeout reached session=${sessionToDestroy ?? 'none'}`)
      await destroySession(sessionToDestroy)
    }, destroySessionAfterIdleMs)
    idleDestroyTimer.unref?.()
  }

  const createSession = async (): Promise<string> => {
    if (sessionCreatePromise) {
      return sessionCreatePromise
    }
    sessionCreatePromise = (async () => {
      const { data } = await axios.post(
        `${base}/v1`,
        { cmd: 'sessions.create', session: `hltv_${Date.now()}` },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: maxTimeout,
          validateStatus: () => true,
        }
      )

      if (data?.status !== 'ok' || typeof data?.session !== 'string') {
        const msg =
          data?.message || data?.status || JSON.stringify(data).slice(0, 200)
        throw new Error(`FlareSolverr session create failed: ${msg}`)
      }
      logSession(`create ok session=${data.session}`)
      return data.session as string
    })()

    try {
      return await sessionCreatePromise
    } finally {
      sessionCreatePromise = null
    }
  }

  const getSession = async (): Promise<string | null> => {
    if (!reuseSession) return null
    if (!currentSessionId) {
      currentSessionId = await createSession()
      requestsInCurrentSession = 0
      logSession(`session attached session=${currentSessionId}`)
    }
    return currentSessionId
  }

  const markRequestDone = async (sessionId: string | null): Promise<void> => {
    if (!reuseSession || !sessionId) return
    requestsInCurrentSession += 1
    logSession(
      `request done session=${sessionId} count=${requestsInCurrentSession}/${recycleSessionAfterRequests}`
    )
    if (requestsInCurrentSession >= recycleSessionAfterRequests) {
      const previousSession = currentSessionId
      currentSessionId = null
      requestsInCurrentSession = 0
      logSession(`recycle threshold reached session=${previousSession ?? 'none'}`)
      await destroySession(previousSession)
      return
    }
    scheduleIdleDestroy()
  }

  const resetCurrentSession = async (): Promise<void> => {
    const previousSession = currentSessionId
    currentSessionId = null
    requestsInCurrentSession = 0
    clearIdleTimer()
    logSession(`session reset session=${previousSession ?? 'none'}`)
    await destroySession(previousSession)
  }

  let exitHookRegistered = false
  const registerExitHook = () => {
    if (exitHookRegistered) return
    exitHookRegistered = true
    const cleanup = () => {
      const sessionToDestroy = currentSessionId
      currentSessionId = null
      requestsInCurrentSession = 0
      clearIdleTimer()
      void destroySession(sessionToDestroy)
    }
    process.once('beforeExit', cleanup)
    process.once('SIGINT', cleanup)
    process.once('SIGTERM', cleanup)
  }
  registerExitHook()

  return async (url: string) => {
    const runRequest = async (forceNewSession: boolean) => {
      if (forceNewSession) {
        await resetCurrentSession()
      }
      const session = await getSession()
      const payload: Record<string, unknown> = { cmd: 'request.get', url, maxTimeout }
      if (session) {
        payload.session = session
        payload.session_ttl_minutes = sessionTtlMinutes
      }
      const { data } = await axios.post(
        `${base}/v1`,
        payload,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: maxTimeout + 15000,
          validateStatus: () => true,
        }
      )
      return { data, session }
    }

    let requestResult = await runRequest(false)
    let data = requestResult.data

    if (data?.status !== 'ok' || typeof data?.solution?.response !== 'string') {
      const message = String(data?.message || '')
      if (
        reuseSession &&
        (message.toLowerCase().includes('session') ||
          message.toLowerCase().includes('invalid'))
      ) {
        logSession(
          `request failed due session state, forcing new session message=${message}`
        )
        requestResult = await runRequest(true)
        data = requestResult.data
      }
    }

    if (data?.status !== 'ok' || typeof data?.solution?.response !== 'string') {
      const msg =
        data?.message || data?.status || JSON.stringify(data).slice(0, 200)
      throw new Error(`FlareSolverr: ${msg}`)
    }

    await markRequestDone(requestResult.session)
    return data.solution.response as string
  }
}

export interface HLTVConfig {
  loadPage: (url: string) => Promise<string>
  httpAgent: HttpsAgent | HttpAgent
  /** Opcional: usado em getTeamStats na página principal de stats (Cloudflare mais rígido em /stats/). */
  loadPageFlareSolverr?: (url: string) => Promise<string>
}

export const defaultLoadPage =
  (httpAgent: HttpsAgent | HttpAgent | undefined) => async (url: string) => {
    let page: any = null
    
    try {
      const browserInstance = await getBrowser()
      page = await browserInstance.newPage()
      
      await page.setViewportSize({ width: 1280, height: 720 })
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      
      const html = await page.content()
      await page.close()
      page = null
      
      return html
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`Erro ao buscar página ${url}: ${errorMessage}`)
      throw error
    } finally {
      if (page) {
        await page.close().catch(() => {})
      }
    }
  };

const defaultAgent = new HttpsAgent()

export const defaultConfig: HLTVConfig = {
  httpAgent: defaultAgent,
  loadPage: defaultLoadPage(defaultAgent)
}
