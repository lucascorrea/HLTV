import { GameMap } from '../src/shared/GameMap'
import type { MapResult } from '../src/endpoints/getMatch'
import {
  applyLiveScoreboardToMaps,
  extractLiveMatchScoreFromHtml,
  gameMapFromCurrentRoundText,
  gameMapFromScoreboardClass,
  isHydratedLiveScoreboard,
  liveScoreboardFromScorebotBoard,
  readLiveScoreboardFromHtml
} from '../src/endpoints/parseLiveScoreboard'

const liveHtml = `
<div class="team1-gradient"><div class="teamName">PCIFIC</div></div>
<div class="team2-gradient"><div class="teamName">ex-RUSTEC</div></div>
<div class="mapholder">
  <div class="mapname">Nuke</div>
  <div class="results-left"><div class="results-team-score">5</div></div>
  <div class="results-right"><div class="results-team-score">7</div></div>
</div>
<div class="mapholder">
  <div class="mapname">Anubis</div>
  <div class="results-left"><div class="results-team-score">-</div></div>
  <div class="results-right"><div class="results-team-score">-</div></div>
</div>
<div id="scoreboardElement" class="live-map-de_nuke">
  <div class="scoreboard">
    <span class="currentRoundText">21 - Nuke</span>
    <div class="score scoreText">
      <div class="ctScore">8</div>
      <div class="scoreSeparater">:</div>
      <div class="tScore">12</div>
    </div>
    <table>
      <thead class="ctTeamHeaderBg">
        <tr><td><div class="teamName"><img src="/ct.png" alt="" /> PCIFIC</div></td></tr>
      </thead>
      <thead class="tTeamHeaderBg">
        <tr><td><div class="teamName"><img src="/t.png" alt="" /> ex-RUSTEC</div></td></tr>
      </thead>
    </table>
  </div>
</div>
`

describe('parseLiveScoreboard', () => {
  it('reads ctScore/tScore from React scoreboard', () => {
    const live = readLiveScoreboardFromHtml(liveHtml)
    expect(live).toEqual(
      expect.objectContaining({
        mapName: GameMap.Nuke,
        ctName: 'PCIFIC',
        tName: 'ex-RUSTEC',
        ctScore: 8,
        tScore: 12
      })
    )
  })

  it('overwrites stale mapholder totals on the live map only', () => {
    const live = readLiveScoreboardFromHtml(liveHtml)!
    const maps = applyLiveScoreboardToMaps(
      [
        {
          name: GameMap.Nuke,
          result: {
            team1TotalRounds: 5,
            team2TotalRounds: 7,
            halfResults: [{ team1Rounds: 5, team2Rounds: 7 }]
          }
        },
        { name: GameMap.Anubis, result: undefined }
      ],
      live,
      'PCIFIC',
      'ex-RUSTEC'
    )
    expect(maps[0].result).toEqual({
      team1TotalRounds: 8,
      team2TotalRounds: 12,
      halfResults: [{ team1Rounds: 5, team2Rounds: 7 }]
    })
    expect(maps[1].result).toBeUndefined()
  })

  it('swaps sides when CT is match team2', () => {
    const live = readLiveScoreboardFromHtml(liveHtml)!
    const maps = applyLiveScoreboardToMaps(
      [{ name: GameMap.Nuke }] as MapResult[],
      { ...live, ctName: 'ex-RUSTEC', tName: 'PCIFIC' },
      'PCIFIC',
      'ex-RUSTEC'
    )
    expect(maps[0].result?.team1TotalRounds).toBe(12)
    expect(maps[0].result?.team2TotalRounds).toBe(8)
  })

  it('fills dash mapholder when live board exists', () => {
    const live = readLiveScoreboardFromHtml(liveHtml)!
    const maps = applyLiveScoreboardToMaps(
      [{ name: GameMap.Nuke }] as MapResult[],
      live,
      'PCIFIC',
      'ex-RUSTEC'
    )
    expect(maps[0].result?.team1TotalRounds).toBe(8)
    expect(maps[0].result?.team2TotalRounds).toBe(12)
  })

  it('does not overlay when team names do not match', () => {
    const live = readLiveScoreboardFromHtml(liveHtml)!
    const maps = applyLiveScoreboardToMaps(
      [{ name: GameMap.Nuke, result: { team1TotalRounds: 5, team2TotalRounds: 7, halfResults: [] } }],
      live,
      'FURIA',
      'NAVI'
    )
    expect(maps[0].result?.team1TotalRounds).toBe(5)
  })

  it('returns null without ctScore', () => {
    expect(readLiveScoreboardFromHtml('<div class="countdown">LIVE</div>')).toBeNull()
  })

  it('does not treat empty Flare ctScore as 0-0', () => {
    const emptyFlare = `
<div id="scoreboardElement" class="live-map-de_ancient" data-scorebot-url="https://scorebot-lb.hltv.org" data-scorebot-id="2397824">
  <div class="scoreboard">
    <div class="score scoreText">
      <div class="ctScore"></div>
      <div class="tScore"></div>
    </div>
  </div>
</div>`
    expect(readLiveScoreboardFromHtml(emptyFlare)).toBeNull()
    expect(extractLiveMatchScoreFromHtml(emptyFlare)).toBeNull()
  })

  it('rejects Unknown team names even when scores parse', () => {
    const unknownHtml = `
<div id="scoreboardElement" class="live-map-de_ancient">
  <div class="scoreboard">
    <div class="score scoreText">
      <div class="ctScore">0</div>
      <div class="tScore">0</div>
    </div>
  </div>
</div>`
    const live = readLiveScoreboardFromHtml(unknownHtml)
    expect(live).toEqual(
      expect.objectContaining({ ctScore: 0, tScore: 0, ctName: 'Unknown' })
    )
    expect(isHydratedLiveScoreboard(live)).toBe(false)
    expect(extractLiveMatchScoreFromHtml(unknownHtml)).toBeNull()
  })

  it('keeps a real pistol 0-0 with team names', () => {
    const pistol = `
<div id="scoreboardElement" class="live-map-de_ancient">
  <div class="scoreboard">
    <div class="score scoreText">
      <div class="ctScore">0</div>
      <div class="tScore">0</div>
    </div>
    <table>
      <thead class="ctTeamHeaderBg">
        <tr><td><div class="teamName">Nexus</div></td></tr>
      </thead>
      <thead class="tTeamHeaderBg">
        <tr><td><div class="teamName">Permitta</div></td></tr>
      </thead>
    </table>
  </div>
</div>`
    expect(extractLiveMatchScoreFromHtml(pistol)).toEqual({
      score: {
        team1: { side: 'CT', name: 'Nexus', score: '0', icon: '' },
        team2: { side: 'T', name: 'Permitta', score: '0', icon: '' }
      },
      map: 'ancient'
    })
  })

  it('extractLiveMatchScoreFromHtml matches getMatchScore shape', () => {
    expect(extractLiveMatchScoreFromHtml(liveHtml)).toEqual({
      score: {
        team1: { side: 'CT', name: 'PCIFIC', score: '8', icon: '/ct.png' },
        team2: { side: 'T', name: 'ex-RUSTEC', score: '12', icon: '/t.png' }
      },
      map: 'nuke'
    })
  })

  it('parses live-map class and currentRoundText', () => {
    expect(gameMapFromScoreboardClass('live-map-de_nuke')).toBe(GameMap.Nuke)
    expect(gameMapFromCurrentRoundText('21 - Nuke')).toBe(GameMap.Nuke)
    expect(gameMapFromScoreboardClass('scoreboard')).toBeUndefined()
  })

  it('maps scorebot snapshot onto match team1/team2', () => {
    const live = liveScoreboardFromScorebotBoard({
      mapName: 'de_ancient',
      ctTeamName: 'Permitta',
      terroristTeamName: 'Nexus',
      counterTerroristScore: 1,
      terroristScore: 5,
      currentRound: 6
    })
    expect(live).toEqual(
      expect.objectContaining({
        mapName: GameMap.Ancient,
        ctName: 'Permitta',
        tName: 'Nexus',
        ctScore: 1,
        tScore: 5
      })
    )
    const maps = applyLiveScoreboardToMaps(
      [
        {
          name: GameMap.Cache,
          result: {
            team1TotalRounds: 13,
            team2TotalRounds: 2,
            halfResults: []
          }
        },
        { name: GameMap.Ancient }
      ] as MapResult[],
      live!,
      'Nexus',
      'Permitta'
    )
    expect(maps[0].result?.team1TotalRounds).toBe(13)
    expect(maps[1].result).toEqual({
      team1TotalRounds: 5,
      team2TotalRounds: 1,
      halfResults: [
        { team1Rounds: 0, team2Rounds: 0 },
        { team1Rounds: 0, team2Rounds: 0 }
      ]
    })
  })
})
