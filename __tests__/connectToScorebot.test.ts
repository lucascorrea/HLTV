import HLTV from '../src/'
import type { ScoreboardUpdate } from '../src/endpoints/connectToScorebot'

const LIVE_MATCH_ID = Number(process.env.SCOREBOT_MATCH_ID || 2394620)
const WAIT_MS = Number(process.env.SCOREBOT_WAIT_MS || 45_000)

const waitForScoreboard = (matchId: number, timeoutMs: number) =>
  new Promise<ScoreboardUpdate>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`scorebot timeout after ${timeoutMs}ms (match ${matchId})`))
    }, timeoutMs)

    HLTV.connectToScorebot({
      id: matchId,
      onScoreboardUpdate: (data, done) => {
        clearTimeout(timer)
        done()
        resolve(data)
      },
      onDisconnect: () => {
        clearTimeout(timer)
        reject(new Error(`scorebot disconnected before scoreboard (match ${matchId})`))
      },
    })
  })

test(
  'connectToScorebot receives scoreboard payload from live match page',
  async () => {
    const data = await waitForScoreboard(LIVE_MATCH_ID, WAIT_MS)

    expect(data.mapName).toEqual(expect.any(String))
    expect(data.counterTerroristScore).toEqual(expect.any(Number))
    expect(data.terroristScore).toEqual(expect.any(Number))
    expect(data.currentRound).toEqual(expect.any(Number))
    expect(Array.isArray(data.CT)).toBe(true)
    expect(Array.isArray(data.TERRORIST)).toBe(true)
  },
  WAIT_MS + 15_000
)
