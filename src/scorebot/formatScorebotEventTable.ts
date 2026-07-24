import type {
  LogUpdate,
  ScoreboardPlayer,
  ScoreboardUpdate,
} from '../endpoints/connectToScorebot'
import {
  formatMapsScoreSuffix,
  getSeriesMapsDisplayFromScoreboard,
  type MapsScoreDisplay,
} from './scorebotSeriesMaps'

type LogEntry = LogUpdate['log'][number]

/** Max rows printed by scorebot demo tables (log / fullLog). */
export const SCOREBOT_TABLE_ROW_LIMIT = 10

export const limitTableRows = <T>(
  rows: T[],
  maxRows = SCOREBOT_TABLE_ROW_LIMIT
): { rows: T[]; omitted: number } => {
  if (rows.length <= maxRows) {
    return { rows, omitted: 0 }
  }

  return {
    rows: rows.slice(-maxRows),
    omitted: rows.length - maxRows,
  }
}

const printLimitedTable = (
  rows: Record<string, string | number | boolean>[],
  context: string
): void => {
  const { rows: visible, omitted } = limitTableRows(rows)
  console.table(visible)
  if (omitted > 0) {
    console.log(
      `… ${omitted} more row(s) omitted in ${context} (showing last ${SCOREBOT_TABLE_ROW_LIMIT})`
    )
  }
}

const playerRow = (side: string, player: ScoreboardPlayer) => ({
  side,
  nick: player.nick,
  K: player.score,
  D: player.deaths,
  A: player.assists,
  HP: player.hp,
  $: player.money,
  weapon: player.primaryWeapon ?? '-',
  alive: player.alive ? 'yes' : 'no',
  ADR: Number(player.damagePrRound.toFixed(1)),
})

const logEntryType = (entry: LogEntry): string => Object.keys(entry)[0] ?? 'Unknown'

const formatLogEntryRow = (entry: LogEntry): Record<string, string | number | boolean> => {
  if ('Kill' in entry) {
    const k = entry.Kill
    return {
      type: 'Kill',
      killer: k.killerNick,
      victim: k.victimNick,
      weapon: k.weapon,
      hs: k.headShot,
      side: `${k.killerSide}→${k.victimSide}`,
    }
  }

  if ('RoundEnd' in entry) {
    const r = entry.RoundEnd
    return {
      type: 'RoundEnd',
      score: `${r.counterTerroristScore}-${r.terroristScore}`,
      winner: r.winner,
      winType: r.winType,
    }
  }

  if ('RoundStart' in entry) {
    return { type: 'RoundStart' }
  }

  if ('MatchStarted' in entry) {
    return { type: 'MatchStarted', map: entry.MatchStarted.map }
  }

  if ('BombPlanted' in entry) {
    return {
      type: 'BombPlanted',
      player: entry.BombPlanted.playerNick,
      ct: entry.BombPlanted.ctPlayers,
      t: entry.BombPlanted.tPlayers,
    }
  }

  if ('BombDefused' in entry) {
    return {
      type: 'BombDefused',
      player: entry.BombDefused.playerNick,
    }
  }

  if ('Assist' in entry) {
    return {
      type: 'Assist',
      assister: entry.Assist.assisterNick,
      victim: entry.Assist.victimNick,
    }
  }

  if ('Suicide' in entry) {
    return {
      type: 'Suicide',
      player: entry.Suicide.playerNick,
      weapon: entry.Suicide.weapon,
    }
  }

  if ('PlayerJoin' in entry) {
    return {
      type: 'PlayerJoin',
      player: entry.PlayerJoin.playerNick,
    }
  }

  if ('PlayerQuit' in entry) {
    return {
      type: 'PlayerQuit',
      player: entry.PlayerQuit.playerNick,
      side: entry.PlayerQuit.playerSide,
    }
  }

  if ('Restart' in entry) {
    return { type: 'Restart' }
  }

  return { type: logEntryType(entry), raw: JSON.stringify(entry).slice(0, 120) }
}

export const scoreboardSnapshotKey = (data: ScoreboardUpdate): string =>
  JSON.stringify({
    map: data.mapName,
    round: data.currentRound,
    score: `${data.counterTerroristScore}-${data.terroristScore}`,
    bomb: data.bombPlanted,
    live: data.live,
    hltvLive: data.hltvLive,
    frozen: data.frozen,
    ct: data.CT.map((p) => [
      p.nick,
      p.hp,
      p.score,
      p.deaths,
      p.alive,
      p.primaryWeapon ?? '',
      p.money,
    ]),
    t: data.TERRORIST.map((p) => [
      p.nick,
      p.hp,
      p.score,
      p.deaths,
      p.alive,
      p.primaryWeapon ?? '',
      p.money,
    ]),
  })

/** True when normalized scoreboard state differs from the previous snapshot key. */
export const scoreboardSnapshotChanged = (
  previousKey: string,
  data: ScoreboardUpdate
): { key: string; changed: boolean } => {
  const key = scoreboardSnapshotKey(data)
  return { key, changed: key !== previousKey }
}

/** One-line scoreboard summary with explicit CT/T sides and team names. */
export const formatScoreboardHeadline = (
  data: ScoreboardUpdate,
  series?: MapsScoreDisplay | null
): string => {
  const mapScore = `CT ${data.ctTeamName} ${data.counterTerroristScore} | T ${data.terroristTeamName} ${data.terroristScore}`
  const mapsSuffix = formatMapsScoreSuffix(
    series ?? getSeriesMapsDisplayFromScoreboard(data)
  )

  return `${data.mapName} round ${data.currentRound} | ${mapScore}${mapsSuffix}`
}

export const formatScoreboardStatusSuffix = (data: ScoreboardUpdate): string => {
  const hltvLive =
    data.hltvLive !== undefined ? ` hltvLive=${data.hltvLive}` : ''
  return `bomb=${data.bombPlanted} live=${data.live}${hltvLive}`
}

export const printScoreboardTable = (
  count: number,
  data: ScoreboardUpdate,
  series?: MapsScoreDisplay | null
): void => {
  console.log('')
  console.log(
    `[scoreboard #${count}] ${formatScoreboardHeadline(data, series)} | ${formatScoreboardStatusSuffix(data)}`
  )

  const rows = [
    ...data.CT.map((player) => playerRow('CT', player)),
    ...data.TERRORIST.map((player) => playerRow('T', player)),
  ]

  console.table(rows)
}

export const printLogTable = (count: number, data: LogUpdate): void => {
  const rows = data.log.map(formatLogEntryRow)
  console.log('')
  console.log(`[log #${count}] ${rows.length} event(s)`)
  printLimitedTable(rows, `log #${count}`)
}

export const printFullLogTable = (count: number, data: unknown): void => {
  const payload = data as { log?: unknown[] }
  const size = Array.isArray(payload?.log) ? payload.log.length : '?'

  console.log('')
  console.log(`[fullLog #${count}] entries=${size}`)
  if (Array.isArray(payload?.log) && payload.log.length > 0) {
    const rows = payload.log.map((entry) =>
      formatLogEntryRow(entry as LogEntry)
    )
    printLimitedTable(rows, `fullLog #${count}`)
  }
}

export const printUnknownEventTable = (
  count: number,
  name: string,
  data: unknown
): void => {
  console.log('')
  console.log(`[event #${count}] ${name}`)
  if (data && typeof data === 'object') {
    console.table([data as Record<string, unknown>])
    return
  }

  console.log(String(data))
}
