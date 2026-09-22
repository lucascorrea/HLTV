import {
  readMatchPageStateFromHtml,
  readSeriesMapWinsFromHtml
} from '../src/scorebot/matchPageHtml'

const liveHtml = `
<div class="team1-gradient"><div class="teamName">MIBR</div></div>
<div class="team2-gradient"><div class="teamName">NRG</div></div>
<div class="countdown">LIVE</div>
<div class="mapholder">
  <div class="mapname">Nuke</div>
  <div class="results-left"><div class="results-team-score">13</div></div>
  <div class="results-right"><div class="results-team-score">7</div></div>
</div>
<div id="scoreboardElement" data-scorebot-url="https://scorebot-lb.hltv.org" data-scorebot-id="2398104"></div>
`

describe('matchPageHtml', () => {
  it('reads live scorebot attrs from Flare HTML', () => {
    expect(readMatchPageStateFromHtml(liveHtml)).toEqual({
      kind: 'live_scorebot',
      scorebotUrl: 'https://scorebot-lb.hltv.org',
      scorebotId: '2398104'
    })
  })

  it('returns unknown without countdown or scoreboard', () => {
    expect(readMatchPageStateFromHtml('<html><title>Just a moment...</title></html>')).toEqual({
      kind: 'unknown',
      countdown: null
    })
  })

  it('reads series map wins from mapholder rows', () => {
    expect(readSeriesMapWinsFromHtml(liveHtml)).toEqual({
      team1Name: 'MIBR',
      team2Name: 'NRG',
      team1Win: 1,
      team2Win: 0
    })
  })
})
