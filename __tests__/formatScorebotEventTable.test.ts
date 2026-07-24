import type { LogUpdate, ScoreboardUpdate } from '../src/endpoints/connectToScorebot'
import {
  formatScoreboardHeadline,
  limitTableRows,
  printLogTable,
  printScoreboardTable,
  SCOREBOT_TABLE_ROW_LIMIT,
  scoreboardSnapshotChanged,
  scoreboardSnapshotKey,
} from '../src/scorebot/formatScorebotEventTable'

describe('formatScorebotEventTable', () => {
  it('limitTableRows keeps last N rows', () => {
    const input = Array.from({ length: 25 }, (_, i) => i)
    const { rows, omitted } = limitTableRows(input, 10)

    expect(rows).toEqual([15, 16, 17, 18, 19, 20, 21, 22, 23, 24])
    expect(omitted).toBe(15)
  })

  it('limitTableRows returns all rows when under limit', () => {
    const input = [1, 2, 3]
    const { rows, omitted } = limitTableRows(input, SCOREBOT_TABLE_ROW_LIMIT)

    expect(rows).toEqual([1, 2, 3])
    expect(omitted).toBe(0)
  })
  it('dedupe key changes when round score changes', () => {
    const base: ScoreboardUpdate = {
      TERRORIST: [],
      CT: [],
      ctMatchHistory: { firstHalf: [], secondHalf: [] },
      terroristMatchHistory: { firstHalf: [], secondHalf: [] },
      bombPlanted: false,
      mapName: 'de_overpass',
      terroristTeamName: 'T',
      ctTeamName: 'CT',
      currentRound: 4,
      counterTerroristScore: 1,
      terroristScore: 2,
      ctTeamId: 1,
      tTeamId: 2,
      frozen: false,
      live: true,
      ctTeamScore: 1,
      tTeamScore: 2,
      startingCt: 0,
      startingT: 0,
    }

    const same = scoreboardSnapshotKey(base)
    const changed = scoreboardSnapshotKey({
      ...base,
      terroristScore: 3,
    })

    expect(same).not.toEqual(changed)
  })

  it('scoreboardSnapshotChanged reports duplicate snapshots', () => {
    const base: ScoreboardUpdate = {
      TERRORIST: [],
      CT: [],
      ctMatchHistory: { firstHalf: [], secondHalf: [] },
      terroristMatchHistory: { firstHalf: [], secondHalf: [] },
      bombPlanted: false,
      mapName: 'de_nuke',
      terroristTeamName: 'Lazer Cats',
      ctTeamName: 'TNC',
      currentRound: 12,
      counterTerroristScore: 6,
      terroristScore: 6,
      ctTeamId: 1,
      tTeamId: 2,
      frozen: false,
      live: true,
      hltvLive: true,
      ctTeamScore: 6,
      tTeamScore: 6,
      startingCt: 0,
      startingT: 0,
    }

    const first = scoreboardSnapshotChanged('', base)
    expect(first.changed).toBe(true)

    const duplicate = scoreboardSnapshotChanged(first.key, base)
    expect(duplicate.changed).toBe(false)
    expect(duplicate.key).toBe(first.key)

    const scoreBump = scoreboardSnapshotChanged(first.key, {
      ...base,
      counterTerroristScore: 7,
    })
    expect(scoreBump.changed).toBe(true)
  })

  it('formatScoreboardHeadline labels CT/T sides and team scores', () => {
    const line = formatScoreboardHeadline({
      TERRORIST: [],
      CT: [],
      ctMatchHistory: { firstHalf: [], secondHalf: [] },
      terroristMatchHistory: { firstHalf: [], secondHalf: [] },
      bombPlanted: false,
      mapName: 'de_dust2',
      terroristTeamName: 'ex-RUBY',
      ctTeamName: 'PsychoFace',
      currentRound: 24,
      counterTerroristScore: 11,
      terroristScore: 13,
      ctTeamId: 1,
      tTeamId: 2,
      frozen: false,
      live: true,
      hltvLive: true,
      ctTeamScore: 0,
      tTeamScore: 1,
      startingCt: 0,
      startingT: 0,
    })

    expect(line).toBe(
      'de_dust2 round 24 | CT PsychoFace 11 | T ex-RUBY 13 | maps PsychoFace 0-1 ex-RUBY'
    )
  })

  it('formatScoreboardHeadline shows BO series maps from tracker', () => {
    const line = formatScoreboardHeadline(
      {
        TERRORIST: [],
        CT: [],
        ctMatchHistory: { firstHalf: [], secondHalf: [] },
        terroristMatchHistory: { firstHalf: [], secondHalf: [] },
        bombPlanted: false,
        mapName: 'de_ancient',
        terroristTeamName: 'PsychoFace',
        ctTeamName: 'ex-RUBY',
        currentRound: 6,
        counterTerroristScore: 4,
        terroristScore: 1,
        ctTeamId: 13617,
        tTeamId: 13799,
        frozen: false,
        live: true,
        hltvLive: true,
        ctTeamScore: 4,
        tTeamScore: 1,
        startingCt: 13617,
        startingT: 13799,
      },
      {
        team1: 'ex-RUBY',
        team1Maps: 1,
        team2: 'PsychoFace',
        team2Maps: 0,
      }
    )

    expect(line).toBe(
      'de_ancient round 6 | CT ex-RUBY 4 | T PsychoFace 1 | maps ex-RUBY 1-0 PsychoFace'
    )
  })

  it('prints tables without throwing', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const tableSpy = jest.spyOn(console, 'table').mockImplementation(() => {})

    printScoreboardTable(1, {
      TERRORIST: [
        {
          steamId: '1',
          dbId: 1,
          name: 'a',
          nick: 'alpha',
          score: 10,
          deaths: 2,
          assists: 1,
          alive: true,
          money: 4000,
          damagePrRound: 90.5,
          hp: 100,
          primaryWeapon: 'ak47',
          kevlar: true,
          helmet: true,
          hasDefuseKit: false,
        },
      ],
      CT: [],
      ctMatchHistory: { firstHalf: [], secondHalf: [] },
      terroristMatchHistory: { firstHalf: [], secondHalf: [] },
      bombPlanted: false,
      mapName: 'de_overpass',
      terroristTeamName: 'T',
      ctTeamName: 'CT',
      currentRound: 1,
      counterTerroristScore: 0,
      terroristScore: 1,
      ctTeamId: 1,
      tTeamId: 2,
      frozen: false,
      live: true,
      ctTeamScore: 0,
      tTeamScore: 1,
      startingCt: 0,
      startingT: 0,
    })

    printLogTable(1, {
      log: [
        {
          Kill: {
            killerName: 'a',
            killerNick: 'alpha',
            killerSide: 'TERRORIST',
            victimName: 'b',
            victimNick: 'beta',
            victimSide: 'CT',
            weapon: 'ak47',
            headShot: true,
            eventId: 1,
            victimX: 0,
            victimY: 0,
            killerX: 0,
            killerY: 0,
            killerId: 1,
            victimId: 2,
          },
        },
      ],
    })

    expect(tableSpy).toHaveBeenCalled()
    logSpy.mockRestore()
    tableSpy.mockRestore()
  })

  it('printLogTable truncates large batches to last 10 rows', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const tableSpy = jest.spyOn(console, 'table').mockImplementation(() => {})

    const kills = Array.from({ length: 15 }, (_, i) => ({
      Kill: {
        killerName: 'a',
        killerNick: `killer${i}`,
        killerSide: 'TERRORIST' as const,
        victimName: 'b',
        victimNick: `victim${i}`,
        victimSide: 'CT' as const,
        weapon: 'ak47',
        headShot: false,
        eventId: i,
        victimX: 0,
        victimY: 0,
        killerX: 0,
        killerY: 0,
        killerId: 1,
        victimId: 2,
      },
    }))

    printLogTable(99, { log: kills })

    expect(tableSpy).toHaveBeenCalledTimes(1)
    const printedRows = tableSpy.mock.calls[0][0] as unknown[]
    expect(printedRows).toHaveLength(SCOREBOT_TABLE_ROW_LIMIT)
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('5 more row(s) omitted')
    )

    logSpy.mockRestore()
    tableSpy.mockRestore()
  })
})
