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

  return async (url: string) => {
    const { data } = await axios.post(
      `${base}/v1`,
      { cmd: 'request.get', url, maxTimeout },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: maxTimeout + 15000,
        validateStatus: () => true,
      }
    )

    if (data?.status !== 'ok' || typeof data?.solution?.response !== 'string') {
      const msg =
        data?.message || data?.status || JSON.stringify(data).slice(0, 200)
      throw new Error(`FlareSolverr: ${msg}`)
    }

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
