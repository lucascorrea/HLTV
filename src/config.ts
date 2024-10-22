import { Agent as HttpsAgent } from 'https'
import { Agent as HttpAgent } from 'http'
import axios from 'axios'

export interface HLTVConfig {
  loadPage: (url: string) => Promise<string>
  httpAgent: HttpsAgent | HttpAgent
}

export const defaultLoadPage =
  (httpAgent: HttpsAgent | HttpAgent | undefined) => async (url: string) => {
    const response = await axios.get(url, {
      httpAgent: httpAgent,
      httpsAgent: httpAgent
    });
    return response.data;
  };

const defaultAgent = new HttpsAgent()

export const defaultConfig: HLTVConfig = {
  httpAgent: defaultAgent,
  loadPage: defaultLoadPage(defaultAgent)
}
