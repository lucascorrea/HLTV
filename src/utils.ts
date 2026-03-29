import * as cheerio from 'cheerio'
import { randomUUID } from 'crypto'
import { chromium } from 'playwright-extra'
import stealth from 'puppeteer-extra-plugin-stealth'

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

async function getBrowser() {
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

/** Páginas /stats/ reais da HLTV passam de centenas de kB; intersticial do CF costuma ser pequeno. */
const MIN_HTML_LIKELY_REAL_PAGE = 200_000

/** Mesma validação de HTML que `fetchPage` (Playwright), para HTML vindo do FlareSolverr. */
function assertHtmlNotBlocked(html: string, url: string): void {
  if (html.length >= MIN_HTML_LIKELY_REAL_PAGE) {
    return
  }

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  const title = (titleMatch?.[1] || '').trim().toLowerCase()
  if (title.includes('just a moment') || title.includes('attention required')) {
    throw new Error(`Acesso negado | www.hltv.org bloqueado pelo Cloudflare (${url})`)
  }

  const errorPatterns = [
    'error code:',
    'Sorry, you have been blocked',
    'Checking your browser before accessing',
    'Enable JavaScript and cookies to continue',
    'verify you are human',
    'Performing security verification',
  ]
  const found = errorPatterns.find((p) => html.includes(p))
  if (found) {
    throw new Error(`Acesso negado | www.hltv.org bloqueado pelo Cloudflare (${url})`)
  }

  if (html.includes('Just a moment')) {
    throw new Error(`Acesso negado | www.hltv.org bloqueado pelo Cloudflare (${url})`)
  }
}

/**
 * Carrega HTML via `loadPageFlareSolverr` (ex.: FlareSolverr) e devolve Cheerio.
 * Em getTeamStats use `config.loadPageFlareSolverr ?? config.loadPage` se quiser fallback.
 */
export const fetchPageFlareSolverr = async (
  url: string,
  loadPageFlareSolverr: (url: string) => Promise<string>
): Promise<cheerio.Root> => {
  try {
    const html = await loadPageFlareSolverr(url)
    assertHtmlNotBlocked(html, url)
    return cheerio.load(html)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`Erro ao buscar página (FlareSolverr) ${url}: ${errorMessage}`)
    throw error
  }
}

// Implementação com Playwright
export const fetchPage = async (
  url: string,
  loadPage: (url: string) => Promise<string>
): Promise<cheerio.Root> => {
  let semaphoreAcquired = false
  let page: any = null
  
  try {
    await playwrightSemaphore.acquire()
    semaphoreAcquired = true
    
    const browserInstance = await getBrowser()
    page = await browserInstance.newPage()
    
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    
    const html = await page.content()
    
    await page.close()
    page = null

    assertHtmlNotBlocked(html, url)

    return cheerio.load(html)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`Erro ao buscar página ${url}: ${errorMessage}`)
    throw error
  } finally {
    if (page) {
      await page.close().catch(() => {})
    }
    if (semaphoreAcquired) {
      playwrightSemaphore.release()
    }
  }
};

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
