// Keep first: strips a bogus PLAYWRIGHT_BROWSERS_PATH before playwright-core reads it.
import './playwrightEnv'
import * as cheerio from 'cheerio'
import { randomUUID } from 'crypto'
import { chromium } from 'playwright-extra'
import stealth from 'puppeteer-extra-plugin-stealth'
import {
  attachFlareMeta,
  type FlareCookie,
  type FlareLoadPage
} from './flarePage'

// Configure playwright with stealth plugin
chromium.use(stealth())

let browser: any = null
let browserInitPromise: Promise<any> | null = null

/**
 * Semáforo para controlar concorrência
 */
class Semaphore {
  private max: number
  private current: number
  private queue: Array<() => void>

  constructor(max: number) {
    this.max = max
    this.current = 0
    this.queue = []
  }

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++
      return Promise.resolve()
    }

    console.warn(
      `[playwright] waiting for browser slot (${this.max} sessions in use)...`
    )

    return new Promise(resolve => {
      this.queue.push(resolve)
    })
  }

  release(): void {
    this.current--
    if (this.queue.length > 0) {
      this.current++
      const resolve = this.queue.shift()!
      resolve()
    }
  }
}

const playwrightSemaphore = new Semaphore(8)

/** Opens a Playwright page guarded by the shared HLTV browser semaphore. */
export const acquirePlaywrightPage = async () => {
  await playwrightSemaphore.acquire()

  const browserInstance = await getBrowser()
  const page = await browserInstance.newPage()

  return {
    page,
    release: async () => {
      await page.close().catch(() => {})
      playwrightSemaphore.release()
    },
  }
}

export async function getBrowser() {
  if (browser && browser.isConnected()) {
    return browser
  }

  if (browserInitPromise) {
    return browserInitPromise
  }

  browserInitPromise = chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280x720',
      '--disable-extensions',
      '--disable-background-networking',
      '--no-first-run',
      '--disable-blink-features=AutomationControlled',
    ],
    timeout: 30000
  })

  browser = await browserInitPromise
  browserInitPromise = null

  browser.on('disconnected', () => {
    browser = null
  })

  return browser
}

const HLTV_READY_SELECTOR =
  '.navbar, .contentCol, .timeAndEvent, .teamsBox, .live-matches-wrapper, .matches'

/** Default HTML path is FlareSolverr; Playwright bundled Chromium currently dies on CF. */
export function htmlLoaderMode(): 'flaresolverr' | 'playwright' {
  const raw = String(process.env.HLTV_HTML_LOADER || 'flaresolverr')
    .trim()
    .toLowerCase()
  if (raw === 'playwright' || raw === 'pw') return 'playwright'
  return 'flaresolverr'
}

export function htmlLooksLikeMatchPage(html: string): boolean {
  return (
    html.includes('timeAndEvent') ||
    html.includes('teamsBox') ||
    html.includes('mapholder')
  )
}

function isMatchDetailUrl(url: string): boolean {
  return /\/matches\/\d+/i.test(url) && !/[?&]/.test(url.split('/matches/')[1] || '')
}

function htmlTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return (titleMatch?.[1] || '').trim()
}

function looksLikeCloudflareInterstitial(html: string): boolean {
  const title = htmlTitle(html).toLowerCase()
  if (title.includes('just a moment') || title.includes('attention required')) {
    return true
  }
  const errorPatterns = [
    'error code:',
    'Sorry, you have been blocked',
    'Checking your browser before accessing',
    'Enable JavaScript and cookies to continue',
    'verify you are human',
    'Performing security verification',
  ]
  return errorPatterns.some((p) => html.includes(p)) || html.includes('Just a moment')
}

/**
 * Reject CF interstitial and match URLs that resolved to the HLTV homepage.
 * Title checks run even on large HTML — CF challenge pages can grow past 20kB.
 */
export function assertHltvHtml(html: string, url: string): void {
  if (looksLikeCloudflareInterstitial(html)) {
    throw new Error(
      `Acesso negado | www.hltv.org bloqueado pelo Cloudflare (${url})`
    )
  }

  if (isMatchDetailUrl(url) && !htmlLooksLikeMatchPage(html)) {
    throw new Error(
      `HLTV match page shell missing for ${url} (got homepage/listing HTML)`
    )
  }
}

/** @deprecated use assertHltvHtml */
function assertHtmlNotBlocked(html: string, url: string): void {
  assertHltvHtml(html, url)
}

/**
 * Wait until CF interstitial navigates to real HLTV chrome.
 * Headless Chromium usually never passes; keep the timeout short.
 */
export async function waitForHltvDocument(
  page: { title: () => Promise<string>; $: (sel: string) => Promise<unknown>; url?: () => string },
  timeoutMs = 12_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const title = (await page.title()).toLowerCase()
      if (
        !title.includes('just a moment') &&
        !title.includes('attention required')
      ) {
        const ready = await page.$(HLTV_READY_SELECTOR)
        if (ready) return
      }
    } catch {
      // Navigation destroys the execution context; retry.
    }
    await sleep(400)
  }
  const url = typeof page.url === 'function' ? page.url() : ''
  throw new Error(
    `Acesso negado | www.hltv.org bloqueado pelo Cloudflare (${url})`
  )
}

/**
 * Carrega HTML via `loadPageFlareSolverr` (ex.: FlareSolverr) e devolve Cheerio.
 * Em getTeamStats use `config.loadPageFlareSolverr ?? config.loadPage` se quiser fallback.
 */
export const fetchPageFlareSolverr = async (
  url: string,
  loadPageFlareSolverr: FlareLoadPage
): Promise<cheerio.Root> => {
  try {
    let html: string
    let cookies: FlareCookie[] = []
    let userAgent = ''
    if (typeof loadPageFlareSolverr.withMeta === 'function') {
      const meta = await loadPageFlareSolverr.withMeta(url)
      html = meta.html
      cookies = meta.cookies
      userAgent = meta.userAgent
    } else {
      html = await loadPageFlareSolverr(url)
    }
    assertHltvHtml(html, url)
    const root = cheerio.load(html)
    attachFlareMeta(root, { cookies, userAgent })
    return root
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`Erro ao buscar página (FlareSolverr) ${url}: ${errorMessage}`)
    throw error
  }
}

async function fetchPagePlaywright(
  url: string,
  loadPageFlareSolverr?: FlareLoadPage,
  allowFlareRetry = true
): Promise<cheerio.Root> {
  let semaphoreAcquired = false
  let page: any = null

  try {
    await playwrightSemaphore.acquire()
    semaphoreAcquired = true

    const browserInstance = await getBrowser()
    page = await browserInstance.newPage()

    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await waitForHltvDocument(page)

    const html = await page.content()

    await page.close()
    page = null

    assertHltvHtml(html, url)

    return cheerio.load(html)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`Erro ao buscar página ${url}: ${errorMessage}`)
    if (allowFlareRetry && loadPageFlareSolverr) {
      console.error(`fetchPage: retry once via FlareSolverr ${url}`)
      return await fetchPageFlareSolverr(url, loadPageFlareSolverr)
    }
    throw error
  } finally {
    if (page) {
      await page.close().catch(() => {})
    }
    if (semaphoreAcquired) {
      playwrightSemaphore.release()
    }
  }
}

/**
 * Load HLTV HTML. Default is FlareSolverr only — Playwright Chromium dies on
 * Cloudflare (`Just a moment` at `domcontentloaded`), so a PW fallback after
 * Flare failure hides the real error and burns a local browser. Opt in with
 * `HLTV_HTML_LOADER=playwright`.
 */
export const fetchPage = async (
  url: string,
  _loadPage: (url: string) => Promise<string>,
  loadPageFlareSolverr?: FlareLoadPage
): Promise<cheerio.Root> => {
  const preferFlare =
    htmlLoaderMode() === 'flaresolverr' && Boolean(loadPageFlareSolverr)

  if (preferFlare && loadPageFlareSolverr) {
    return await fetchPageFlareSolverr(url, loadPageFlareSolverr)
  }

  return await fetchPagePlaywright(url, loadPageFlareSolverr, true)
}

/**
 * Raw page body with the same Flare-first order as `fetchPage`.
 * Used by `/search?term=` (JSON, not Cheerio HTML).
 */
export const fetchRawPreferFlare = async (
  url: string,
  loadPage: (url: string) => Promise<string>,
  loadPageFlareSolverr?: FlareLoadPage
): Promise<string> => {
  const preferFlare =
    htmlLoaderMode() === 'flaresolverr' && Boolean(loadPageFlareSolverr)

  if (preferFlare && loadPageFlareSolverr) {
    const html =
      typeof loadPageFlareSolverr.withMeta === 'function'
        ? (await loadPageFlareSolverr.withMeta(url)).html
        : await loadPageFlareSolverr(url)
    assertHltvHtml(html, url)
    return html
  }

  const html = await loadPage(url)
  assertHltvHtml(html, url)
  return html
}

/** Parse JSON from a FlareSolverr body (raw JSON or HTML-wrapped `<pre>`). */
export const parseHltvJsonPayload = (raw: string): unknown => {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('Empty HLTV search response')
  }

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return JSON.parse(trimmed)
  }

  const $ = cheerio.load(raw)
  const pre = $('pre').first().text().trim()
  if (pre) {
    return JSON.parse(pre)
  }

  const start = trimmed.search(/[\[{]/)
  if (start === -1) {
    throw new Error('No JSON in HLTV search response')
  }
  return JSON.parse(trimmed.slice(start))
}

export const generateRandomSuffix = () => {
  return randomUUID()
}

export const percentageToDecimalOdd = (odd: number): number =>
  parseFloat(((1 / odd) * 100).toFixed(2))

export function getIdAt(
  index: number,
  href: string | undefined
): number | undefined
export function getIdAt(
  index: number
): (href: string | undefined) => number | undefined
export function getIdAt(index?: number, href?: string): any {
  switch (arguments.length) {
    case 1:
      return (h: string | undefined) => getIdAt(index!, h)
    default:
      if (href == null || href === '') {
        return undefined
      }
      return parseNumber(href.split('/')[index!])
  }
}

export const notNull = <T>(x: T | null): x is T => x !== null

export const parseNumber = (str: string | undefined): number | undefined => {
  if (!str) {
    return undefined
  }

  const num = Number(str)

  return Number.isNaN(num) ? undefined : num
}

export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Parse HLTV stats table date (DD/MM/YY) as UTC midnight — date-only, no local TZ shift.
 */
export const parseHltvStatsDate = (source: string): number => {
  const parts = source?.split('/') ?? []
  if (parts.length < 3) {
    return 0
  }
  const day = parseNumber(parts[0].trim()) ?? 0
  const month = parseNumber(parts[1].trim()) ?? 0
  let year = parseNumber(parts[2].trim()) ?? 0
  if (year > 0 && year < 100) {
    year += 2000
  }
  if (day <= 0 || month <= 0 || year <= 0) {
    return 0
  }
  return Date.UTC(year, month - 1, day)
}

/** Context attached to scraper errors for logs (worker / monitoring). */
export type ScrapeErrorContext = {
  endpoint: string
  matchId?: number
  pageUrl?: string
  step?: string
  /** What the parser expected (e.g. non-empty href). */
  expected?: string
  /** What was present instead (e.g. undefined, snippet). */
  got?: string
  selector?: string
  hint?: string
  extra?: Record<string, unknown>
}

/**
 * Wraps an error with JSON `scrapeContext` on the Error object and in `message`
 * so plain `${err}` in loggers still shows useful detail.
 */
export function toScrapeError(err: unknown, ctx: ScrapeErrorContext): Error {
  const base = err instanceof Error ? err : new Error(String(err))
  const scrapeContext = {
    ...ctx,
    originalMessage: base.message,
    originalName: base.name,
  }
  const wrapped = new Error(
    `${base.message} | HLTV scrapeContext=${JSON.stringify(scrapeContext)}`
  )
  wrapped.name = 'HLTVScrapeError'
  wrapped.stack = base.stack
  ;(wrapped as Error & { scrapeContext: typeof scrapeContext }).scrapeContext =
    scrapeContext
  ;(wrapped as Error & { cause?: unknown }).cause = base
  return wrapped
}
