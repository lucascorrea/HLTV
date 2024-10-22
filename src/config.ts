import { Agent as HttpsAgent } from 'https'
import { Agent as HttpAgent } from 'http'
import { gotScraping } from 'got-scraping'

export interface HLTVConfig {
  loadPage: (url: string) => Promise<string>
  httpAgent: HttpsAgent | HttpAgent
}

export const defaultLoadPage =
  (httpAgent: HttpsAgent | HttpAgent | undefined) => async (url: string) => {
    const response = await gotScraping({
      url,
      agent: {
        http: httpAgent as HttpAgent | undefined,
        https: httpAgent as HttpsAgent | undefined
      }
    });
    return response.body;
  };

const defaultAgent = new HttpsAgent()

export const defaultConfig: HLTVConfig = {
  httpAgent: defaultAgent,
  loadPage: defaultLoadPage(defaultAgent)
}
