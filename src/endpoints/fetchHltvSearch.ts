import { HLTVConfig } from '../config'
import { fetchRawPreferFlare, parseHltvJsonPayload } from '../utils'

/** HLTV `/search?term=` JSON via FlareSolverr (Playwright fallback). */
export const fetchHltvSearch = async (
  config: HLTVConfig,
  name: string
): Promise<any[]> => {
  const raw = await fetchRawPreferFlare(
    `https://www.hltv.org/search?term=${name}`,
    config.loadPage,
    config.loadPageFlareSolverr
  )
  const parsed = parseHltvJsonPayload(raw)
  if (!Array.isArray(parsed)) {
    throw new Error('HLTV search did not return a JSON array')
  }
  return parsed
}
