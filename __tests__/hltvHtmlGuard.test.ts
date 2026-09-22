import {
  assertHltvHtml,
  htmlLoaderMode,
  htmlLooksLikeMatchPage,
} from '../src/utils'

describe('htmlLoaderMode', () => {
  const prev = process.env.HLTV_HTML_LOADER

  afterEach(() => {
    if (prev === undefined) delete process.env.HLTV_HTML_LOADER
    else process.env.HLTV_HTML_LOADER = prev
  })

  test('defaults to flaresolverr', () => {
    delete process.env.HLTV_HTML_LOADER
    expect(htmlLoaderMode()).toBe('flaresolverr')
  })

  test('playwright opt-in', () => {
    process.env.HLTV_HTML_LOADER = 'playwright'
    expect(htmlLoaderMode()).toBe('playwright')
  })
})

describe('htmlLooksLikeMatchPage', () => {
  test('accepts current match chrome', () => {
    expect(
      htmlLooksLikeMatchPage(
        '<div class="timeAndEvent"></div><div class="teamsBox"></div>'
      )
    ).toBe(true)
  })

  test('rejects homepage shell', () => {
    expect(
      htmlLooksLikeMatchPage(
        '<title>HLTV.org - The home of competitive Counter-Strike</title>'
      )
    ).toBe(false)
  })
})

describe('assertHltvHtml', () => {
  test('rejects Cloudflare interstitial even when HTML is large', () => {
    const html = `<title>Just a moment...</title>${'x'.repeat(250_000)}`
    expect(() =>
      assertHltvHtml(html, 'https://www.hltv.org/matches/2393771/abc')
    ).toThrow(/Cloudflare/)
  })

  test('rejects match URL that resolved to the homepage', () => {
    const html = `<title>HLTV.org - The home of competitive Counter-Strike</title>${'y'.repeat(250_000)}`
    expect(() =>
      assertHltvHtml(html, 'https://www.hltv.org/matches/2393771/')
    ).toThrow(/match page shell missing/)
  })

  test('allows listing URL without match chrome', () => {
    const html = `<title>CS2 Matches</title>${'z'.repeat(250_000)}`
    expect(() => assertHltvHtml(html, 'https://www.hltv.org/matches')).not.toThrow()
  })

  test('allows real match HTML', () => {
    const html =
      '<title>Marsborne vs. Passion UA</title><div class="timeAndEvent"></div><div class="teamsBox"></div>'
    expect(() =>
      assertHltvHtml(html, 'https://www.hltv.org/matches/2393771/x')
    ).not.toThrow()
  })
})
