export type MatchPageState =
  | {
      kind: 'live_scorebot'
      scorebotUrl: string
      scorebotId: string
    }
  | { kind: 'match_over' }
  | { kind: 'postponed' }
  | { kind: 'scheduled'; countdown: string }
  | { kind: 'wait_timeout'; waitedMs: number }
  | { kind: 'unknown'; countdown: string | null }

/** HLTV countdown text when the full match (series) is finished. */
export const isMatchOverCountdown = (
  countdown: string | null | undefined
): boolean => (countdown?.trim().toLowerCase() ?? '') === 'match over'

export type MatchPageDomSnapshot = {
  hasScoreboardElement: boolean
  scorebotUrl: string | null
  scorebotId: string | null
  countdown: string | null
  isCountdownLive: boolean
  /** True when a Default map row on HLTV shows a decided score (walkover). */
  hasDefaultForfeitMapResult?: boolean
}

/** Reads HLTV match page DOM to know if scorebot is available. */
export const readMatchPageState = (args: MatchPageDomSnapshot): MatchPageState => {
  const countdown = args.countdown?.trim() ?? ''

  // Terminal states win over stale scorebot attrs left on the DOM after reload.
  if (isMatchOverCountdown(countdown)) {
    return { kind: 'match_over' }
  }

  if (countdown === 'Match postponed') {
    return { kind: 'postponed' }
  }

  // Live scorebot wins over a Default (walkover) map row. Map1 WO in a BO3
  // still shows default 1-0 while map2 is played (match 2395941) — that must
  // NOT be treated as series over.
  if (args.hasScoreboardElement && args.scorebotUrl && args.scorebotId) {
    return {
      kind: 'live_scorebot',
      scorebotUrl: args.scorebotUrl,
      scorebotId: args.scorebotId,
    }
  }

  // Full-series forfeit: Default map scored and no live scorebot / LIVE
  // countdown. Do not use Default alone while countdown is LIVE.
  if (
    args.hasDefaultForfeitMapResult &&
    !args.isCountdownLive &&
    !countdown
  ) {
    return { kind: 'match_over' }
  }

  if (args.isCountdownLive) {
    return { kind: 'scheduled', countdown: countdown || 'LIVE' }
  }

  if (countdown) {
    return { kind: 'scheduled', countdown }
  }

  return { kind: 'unknown', countdown: args.countdown }
}
