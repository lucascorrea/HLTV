import * as cheerio from 'cheerio'
import { HLTVScraper } from '../src/scraper'
import { parseMatchesListing } from '../src/endpoints/getMatches'

const listingHtml = `
<div class="matches-chronologically">
  <div class="live-matches-wrapper">
    <div class="liveMatches">
      <div class="live-match-container" stars="1" team1="10" team2="20">
        <a class="a-reset" href="/matches/2397985/black-phoenix-vs-benched-gods"></a>
        <div class="match-meta-live">Live</div>
        <div class="match-event" data-event-headline="CCT">
          <div class="text-ellipsis">CCT</div>
        </div>
        <div class="match-wrapper" team1="10" team2="20"></div>
        <div class="match-teamname">Black Phoenix</div>
        <div class="match-teamname">benched gods</div>
        <div class="match-meta">bo3</div>
      </div>
      <div class="live-match-container" stars="0" team1="11" team2="21" data-unix="1789891200000">
        <a class="a-reset" href="/matches/2397828/ex-rustec-vs-azuolas"></a>
        <div class="match-meta-live">Live</div>
        <div class="match-event" data-event-headline="ESEA">
          <div class="text-ellipsis">ESEA</div>
        </div>
        <div class="match-wrapper" team1="11" team2="21"></div>
        <div class="match-teamname">ex-RUSTEC</div>
        <div class="match-teamname">Azuolas</div>
        <div class="match-meta">bo3</div>
      </div>
      <div class="live-match-container" stars="0" team1="12" team2="22">
        <a class="a-reset" href="/matches/2397687/g2-ares-vs-honved"></a>
        <div class="match-meta-live">Live</div>
        <div class="match-time" data-unix="1789891200000">10:00</div>
        <div class="match-wrapper" team1="12" team2="22"></div>
        <div class="match-teamname">G2 Ares</div>
        <div class="match-teamname">Honvéd</div>
        <div class="match-meta">bo1</div>
      </div>
    </div>
  </div>
  <div class="matches-list">
    <div class="match-zone-wrapper" stars="2">
      <a class="a-reset" href="/matches/2398001/foo-vs-bar"></a>
      <div class="match-time" data-unix="1789900000000">12:00</div>
      <div class="match-team team1"><div class="match-team-logo" src="/a.png"></div></div>
      <div class="match-team team2"><div class="match-team-logo" src="/b.png"></div></div>
      <div class="match-wrapper" team1="30" team2="31"></div>
      <div class="match-teamname">Foo</div>
      <div class="match-teamname">Bar</div>
      <div class="match-meta">bo3</div>
      <div class="match-event" data-event-headline="BLAST"></div>
    </div>
  </div>
</div>
`

describe('parseMatchesListing', () => {
  const matches = parseMatchesListing(HLTVScraper(cheerio.load(listingHtml)))

  it('keeps live cards without matchTime unix', () => {
    const live = matches.filter((m) => m.live)
    expect(live.map((m) => m.id)).toEqual([2397985, 2397828, 2397687])
    expect(live.find((m) => m.id === 2397985)?.date).toBeUndefined()
    expect(live.find((m) => m.id === 2397985)?.team1?.name).toBe('Black Phoenix')
    expect(live.find((m) => m.id === 2397828)?.date).toBe(1789891200000)
    expect(live.find((m) => m.id === 2397687)?.date).toBe(1789891200000)
  })

  it('parses upcoming outside matches-chronologically-hide', () => {
    const upcoming = matches.find((m) => m.id === 2398001)
    expect(upcoming).toEqual(
      expect.objectContaining({
        id: 2398001,
        live: false,
        date: 1789900000000,
        team1: expect.objectContaining({ name: 'Foo' }),
        team2: expect.objectContaining({ name: 'Bar' })
      })
    )
  })
})
