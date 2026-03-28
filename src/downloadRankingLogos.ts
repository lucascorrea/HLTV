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

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const ranking = await HLTV.getTeamRanking()
  for (const row of ranking) {
    const { team } = row
    const safeName = fileNameFromTeamName(team.name)

    if (team.id == null) {
      console.warn(`[skip] sem team id: ${team.name}`)
      continue
    }
    if (!safeName) {
      console.warn(`[skip] nome vazio após sanitizar: id=${team.id}`)
      continue
    }

    const rankingLogo =
      team.logo != null && team.logo !== '' ? String(team.logo) : undefined
    const logoUrl = await resolveLogoUrl(team.id, rankingLogo)

    if (!logoUrl) {
      console.warn(`[skip] sem logo resolvido: ${team.name} (id=${team.id})`)
      await delay(DELAY_MS_BETWEEN_TEAMS)
      continue
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
      console.log(`[ok] ${team.name} → ${path.basename(dest)}`)
    } catch (err) {
      console.error(`[erro] ${team.name} (${logoUrl}):`, err)
    }

    await delay(DELAY_MS_BETWEEN_TEAMS)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
