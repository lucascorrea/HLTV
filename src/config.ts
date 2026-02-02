import { Agent as HttpsAgent } from 'https'
import { Agent as HttpAgent } from 'http'
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

export interface HLTVConfig {
  loadPage: (url: string) => Promise<string>
  httpAgent: HttpsAgent | HttpAgent
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
