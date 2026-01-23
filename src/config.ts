import { Agent as HttpsAgent } from 'https'
import { Agent as HttpAgent } from 'http'
import axios from 'axios'

const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL || 'http://localhost:8191/v1'

export interface HLTVConfig {
  loadPage: (url: string) => Promise<string>
  httpAgent: HttpsAgent | HttpAgent
}

export const defaultLoadPage =
  (httpAgent: HttpsAgent | HttpAgent | undefined) => async (url: string) => {
    try {
      const response = await axios.post(FLARESOLVERR_URL, {
        cmd: 'request.get',
        url: url,
        maxTimeout: 60000
      })

      if (response.data.status !== 'ok') {
        throw new Error(`FlareSolverr erro: ${response.data.message || 'Erro desconhecido'}`)
      }

      return response.data.solution.response
    } catch (error) {
      console.error(`Erro ao buscar página ${url}:`, error)
      throw error
    }
  };

const defaultAgent = new HttpsAgent()

export const defaultConfig: HLTVConfig = {
  httpAgent: defaultAgent,
  loadPage: defaultLoadPage(defaultAgent)
}
