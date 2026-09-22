import { parseNumber } from '../utils'

export interface RankingPoint {
  rank: number
  date: string
}

type ChartPoint = {
  value?: number | string
  tooltip?: string
  tooltext?: string
  link?: string
}

type ChartDataset = {
  data?: ChartPoint[]
}

type ChartJsConfig = {
  data?: {
    datasets?: ChartDataset[]
  }
  dataSource?: {
    dataset?: Array<{ data?: Array<{ value?: number | string; tooltext?: string }> }>
  }
}

function dateFromTooltip(tooltip: string | undefined): string {
  if (!tooltip) return ''
  const match = tooltip.match(/<div class="subtitle">([^<]+)<\/div>/)
  return match ? match[1] : ''
}

function pointFromValue(
  value: number | string | undefined,
  tooltip: string | undefined
): RankingPoint | null {
  const rank = parseNumber(String(value ?? ''))
  if (rank == null) return null
  return { rank, date: dateFromTooltip(tooltip) }
}

function isValveRankingLink(link: string | undefined): boolean {
  return String(link || '').includes('/valve-ranking/')
}

function pointsFromChartJsConfig(raw: string): Array<RankingPoint & { valve: boolean }> {
  let cfg: ChartJsConfig
  try {
    cfg = JSON.parse(raw)
  } catch {
    return []
  }
  const out: Array<RankingPoint & { valve: boolean }> = []
  for (const dataset of cfg?.data?.datasets || []) {
    for (const row of dataset.data || []) {
      const point = pointFromValue(row.value, row.tooltip || row.tooltext)
      if (!point) continue
      out.push({ ...point, valve: isValveRankingLink(row.link) })
    }
  }
  return out
}

function pointsFromFusionConfig(raw: string): RankingPoint[] {
  let cfg: ChartJsConfig
  try {
    cfg = JSON.parse(raw)
  } catch {
    return []
  }
  const rows = cfg?.dataSource?.dataset?.[0]?.data || []
  return rows
    .map((row) => pointFromValue(row.value, row.tooltext))
    .filter((row): row is RankingPoint => row != null)
}

/**
 * HLTV replaced FusionCharts `data-fusionchart-config` with Chart.js
 * `data-chartjs-config`. Prefer HLTV world ranking; skip Valve series.
 */
export function parseTeamRankingDevelopment(sources: {
  chartJs?: Array<string | undefined>
  fusion?: string | undefined
}): RankingPoint[] {
  const series = (sources.chartJs || [])
    .filter((raw): raw is string => Boolean(raw && raw.trim()))
    .map(pointsFromChartJsConfig)

  let bestHltv: RankingPoint[] = []
  let bestValve: RankingPoint[] = []
  for (const pts of series) {
    const hltv = pts.filter((p) => !p.valve).map(({ rank, date }) => ({ rank, date }))
    const valve = pts.filter((p) => p.valve).map(({ rank, date }) => ({ rank, date }))
    if (hltv.length > bestHltv.length) bestHltv = hltv
    if (valve.length > bestValve.length) bestValve = valve
  }
  if (bestHltv.length > 0) return bestHltv
  if (bestValve.length > 0) return bestValve

  const fusion = String(sources.fusion || '').trim()
  if (fusion) return pointsFromFusionConfig(fusion)
  return []
}
