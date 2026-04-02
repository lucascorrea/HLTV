import fs from 'fs'
import path from 'path'
import axios from 'axios'
import sharp from 'sharp'
import { HLTV } from './index'

/** Pasta na raiz do repo (criada automaticamente se não existir). */
const OUT_DIR = path.join(__dirname, '..', 'team-logos')

/** Pausa entre cada equipa (getTeam + getMatch); ajuda a não saturar o HLTV. */
const DELAY_MS_BETWEEN_TEAMS = 150

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

function fileNameFromTeamName(name: string): string {
  return name.trim().replace(/\s+/g, '').toLowerCase()
}

function extensionFromUrl(url: string): string {
  try {
    const base = path.basename(new URL(url).pathname)
    const m = base.match(/\.(png|jpg|jpeg|svg|webp)$/i)
    return m ? `.${m[1].toLowerCase()}` : '.png'
  } catch {
    return '.png'
  }
}

function isLikelySvg(buffer: Buffer, url: string): boolean {
  const pathOnly = url.split('?')[0]?.toLowerCase() ?? ''
  if (pathOnly.endsWith('.svg')) return true
  const head = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf8')
  return /<svg[\s>/]/i.test(head)
}

function isUsableLogo(logo: string | undefined | null): logo is string {
  if (logo == null || logo === '') return false
  const s = String(logo)
  return !s.includes('placeholder.svg')
}

/**
 * Uso:
 *   npm run download-ranking-logos
 *   npx ts-node src/downloadRankingLogos.ts --team-id 4608
 *   npx ts-node src/downloadRankingLogos.ts -t 4608
 *   npx ts-node src/downloadRankingLogos.ts --match-id 2392639
 *   npx ts-node src/downloadRankingLogos.ts -m 2392639
 */
function parseCli(): { mode: 'ranking' } | { mode: 'team'; teamId: number } | { mode: 'match'; matchId: number } {
  const argv = process.argv.slice(2)
  let teamId: number | undefined
  let matchId: number | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--team-id' || a === '-t') {
      const v = Number(argv[++i])
      if (!Number.isFinite(v) || v <= 0) {
        console.error(`Valor inválido para ${a}`)
        process.exit(1)
      }
      teamId = v
    } else if (a === '--match-id' || a === '-m') {
      const v = Number(argv[++i])
      if (!Number.isFinite(v) || v <= 0) {
        console.error(`Valor inválido para ${a}`)
        process.exit(1)
      }
      matchId = v
    } else if (a === '-h' || a === '--help') {
      console.log(`downloadRankingLogos — exporta logos para ${OUT_DIR}
  (sem args)     ranking HLTV (comportamento original)
  -t, --team-id   id do clube
  -m, --match-id  id do jogo → logos dos dois clubes`)
      process.exit(0)
    }
  }
  if (teamId != null && matchId != null) {
    console.error('Usa só um: --team-id OU --match-id')
    process.exit(1)
  }
  if (teamId != null) return { mode: 'team', teamId }
  if (matchId != null) return { mode: 'match', matchId }
  return { mode: 'ranking' }
}

/** Logo da página do jogo (prioridade) + mesma cadeia do ranking. */
async function resolveLogoUrlWithPreferred(
  teamId: number,
  preferredFromMatchPage: string | null | undefined,
  rankingFallback?: string | null
): Promise<string | null> {
  if (isUsableLogo(preferredFromMatchPage)) {
    return String(preferredFromMatchPage)
  }
  return resolveLogoUrl(teamId, rankingFallback)
}

/**
 * Logo em melhor resolução: último jogo (getMatch) > linha do recent result > página do time > ranking.
 */
async function resolveLogoUrl(
  teamId: number,
  rankingFallback?: string | null
): Promise<string | null> {
  let fullTeam
  try {
    fullTeam = await HLTV.getTeam({ id: teamId })
  } catch {
    return isUsableLogo(rankingFallback) ? String(rankingFallback) : null
  }

  const recent = fullTeam.recentResults?.[0]

  if (recent?.id) {
    try {
      const match = await HLTV.getMatch({ id: recent.id })
      if (match.team1?.id === teamId && isUsableLogo(match.team1.logo as string)) {
        return String(match.team1.logo)
      }
      if (match.team2?.id === teamId && isUsableLogo(match.team2.logo as string)) {
        return String(match.team2.logo)
      }
    } catch {
      /* usa fallbacks abaixo */
    }

    if (recent.team1.id === teamId && isUsableLogo(recent.team1.logo)) {
      return String(recent.team1.logo)
    }
    if (recent.team2.id === teamId && isUsableLogo(recent.team2.logo)) {
      return String(recent.team2.logo)
    }
  }

  if (isUsableLogo(fullTeam.logo as string)) {
    return String(fullTeam.logo)
  }
  if (isUsableLogo(rankingFallback)) {
    return String(rankingFallback)
  }
  return null
}

async function writeLogoFile(
  buffer: Buffer,
  logoUrl: string,
  safeName: string
): Promise<string> {
  const asSvg = isLikelySvg(buffer, logoUrl)
  if (asSvg) {
    const dest = path.join(OUT_DIR, `${safeName}.png`)
    await sharp(buffer, { density: 384 })
      .png({ compressionLevel: 9 })
      .toFile(dest)
    return dest
  }
  const ext = extensionFromUrl(logoUrl)
  const dest = path.join(OUT_DIR, `${safeName}${ext}`)
  fs.writeFileSync(dest, buffer)
  return dest
}

async function downloadLogoForTeam(opts: {
  teamId: number
  teamName: string
  preferredLogo?: string | null
  rankingFallback?: string | null
  delayAfter: boolean
}): Promise<void> {
  const { teamId, teamName, preferredLogo, rankingFallback, delayAfter } = opts
  const safeName = fileNameFromTeamName(teamName)

  if (!safeName) {
    console.warn(`[skip] nome vazio após sanitizar: id=${teamId}`)
    if (delayAfter) await delay(DELAY_MS_BETWEEN_TEAMS)
    return
  }

  const logoUrl = await resolveLogoUrlWithPreferred(teamId, preferredLogo, rankingFallback)

  if (!logoUrl) {
    console.warn(`[skip] sem logo resolvido: ${teamName} (id=${teamId})`)
    if (delayAfter) await delay(DELAY_MS_BETWEEN_TEAMS)
    return
  }

  try {
    const res = await axios.get<ArrayBuffer>(logoUrl, {
      responseType: 'arraybuffer',
      timeout: 30_000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; HLTV-logo-backup/1.0; +https://www.hltv.org/)',
      },
    })
    const buffer = Buffer.from(res.data)
    const dest = await writeLogoFile(buffer, logoUrl, safeName)
    console.log(`[ok] ${teamName} → ${path.basename(dest)}`)
  } catch (err) {
    console.error(`[erro] ${teamName} (${logoUrl}):`, err)
  }

  if (delayAfter) await delay(DELAY_MS_BETWEEN_TEAMS)
}

async function runTeamId(teamId: number): Promise<void> {
  let teamName = `team-${teamId}`
  try {
    const full = await HLTV.getTeam({ id: teamId })
    if (full.name) teamName = full.name
  } catch {
    console.warn(`[aviso] getTeam(${teamId}) falhou — ficheiro usará nome "${teamName}"`)
  }
  await downloadLogoForTeam({
    teamId,
    teamName,
    delayAfter: false,
  })
}

async function runMatchId(matchId: number): Promise<void> {
  const match = await HLTV.getMatch({ id: matchId })
  const sides = [match.team1, match.team2].filter(Boolean) as NonNullable<
    typeof match.team1
  >[]
  if (sides.length === 0) {
    console.error(`[erro] jogo ${matchId} sem team1/team2`)
    return
  }
  for (let i = 0; i < sides.length; i++) {
    const t = sides[i]
    const id = t.id
    if (id == null || id === 0) {
      console.warn(`[skip] sem id: ${t.name ?? '?'}`)
      continue
    }
    await downloadLogoForTeam({
      teamId: id,
      teamName: t.name ?? `team-${id}`,
      preferredLogo: t.logo != null ? String(t.logo) : undefined,
      delayAfter: i < sides.length - 1,
    })
  }
}

async function runRanking(): Promise<void> {
  const ranking = await HLTV.getTeamRanking()
  for (const row of ranking) {
    const { team } = row
    if (team.id == null) {
      console.warn(`[skip] sem team id: ${team.name}`)
      await delay(DELAY_MS_BETWEEN_TEAMS)
      continue
    }
    const rankingLogo =
      team.logo != null && team.logo !== '' ? String(team.logo) : undefined
    await downloadLogoForTeam({
      teamId: team.id,
      teamName: team.name,
      rankingFallback: rankingLogo,
      delayAfter: true,
    })
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const cli = parseCli()
  if (cli.mode === 'team') {
    console.log(`[modo] team-id ${cli.teamId}`)
    await runTeamId(cli.teamId)
    return
  }
  if (cli.mode === 'match') {
    console.log(`[modo] match-id ${cli.matchId}`)
    await runMatchId(cli.matchId)
    return
  }
  console.log('[modo] ranking completo')
  await runRanking()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
