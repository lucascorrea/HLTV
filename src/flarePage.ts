export type FlareCookie = {
  name: string
  value: string
  domain?: string
  path?: string
}

export type FlarePageMeta = {
  html: string
  cookies: FlareCookie[]
  userAgent: string
}

export type FlareLoadPage = ((url: string) => Promise<string>) & {
  withMeta?: (url: string) => Promise<FlarePageMeta>
}

const FLARE_META_KEY = '__hltvFlareMeta'

type FlareMetaStamp = {
  cookies: FlareCookie[]
  userAgent: string
}

/** Stamp Cheerio root with CF cookies from the same FlareSolverr fetch. */
export const attachFlareMeta = (
  root: object,
  meta: FlareMetaStamp
): void => {
  ;(root as Record<string, unknown>)[FLARE_META_KEY] = meta
}

export const getFlareMeta = (root: object | undefined): FlareMetaStamp | undefined => {
  if (!root) return undefined
  const meta = (root as Record<string, unknown>)[FLARE_META_KEY]
  if (!meta || typeof meta !== 'object') return undefined
  const cookies = (meta as FlareMetaStamp).cookies
  const userAgent = (meta as FlareMetaStamp).userAgent
  if (!Array.isArray(cookies)) return undefined
  return { cookies, userAgent: String(userAgent || '') }
}

const hltvCookieRoot = (host: string): string | null => {
  const h = host.replace(/^\./, '').toLowerCase()
  if (h === 'hltv.org' || h.endsWith('.hltv.org')) return 'hltv.org'
  return null
}

export const cookieMatchesHost = (
  domain: string | undefined,
  host: string
): boolean => {
  const h = host.toLowerCase()
  if (!domain) {
    // Flare sometimes omits Domain; still send CF cookies to HLTV scorebot.
    return hltvCookieRoot(h) != null
  }
  const d = domain.replace(/^\./, '').toLowerCase()
  if (h === d || h.endsWith(`.${d}`)) return true
  const cookieRoot = hltvCookieRoot(d)
  const hostRoot = hltvCookieRoot(h)
  return Boolean(cookieRoot && hostRoot && cookieRoot === hostRoot)
}

export const cookieHeaderForHost = (
  cookies: FlareCookie[] | undefined,
  host: string
): string => {
  if (!cookies?.length) return ''
  return cookies
    .filter((c) => cookieMatchesHost(c.domain, host))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ')
}
