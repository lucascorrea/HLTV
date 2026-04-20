import fs from 'fs'
import path from 'path'
import axios from 'axios'
import sharp from 'sharp'
import { HLTV } from './index'

/** Raiz do repo HLTV (pai de `src/`). */
const REPO_ROOT = path.join(__dirname, '..')

/**
 * Pasta `team-logos` dentro de `TeamLogos.xcassets` no projeto iOS (onde estão os `.imageset`).
 * Override: `CSLIVESTATS_TEAM_LOGOS_XCASSETS=/caminho/.../TeamLogos.xcassets/team-logos`
 */
const IOS_TEAM_LOGOS_IMAGES_DIR =
  process.env.CSLIVESTATS_TEAM_LOGOS_XCASSETS ??
  path.join(
    REPO_ROOT,
    '..',
    'CSLiveStats-iOS',
    'CSLiveStats-iOS',
    'Shared',
    'TeamLogos.xcassets',
    'team-logos'
  )

/** Logos cujo asset já existe no iOS → `team-logos/`. */
const OUT_DIR_EXISTING = path.join(REPO_ROOT, 'team-logos')

/** Logos ainda não presentes no xcassets → `team-logos/new/`. */
const OUT_DIR_NEW = path.join(REPO_ROOT, 'team-logos', 'new')

/**
 * Limite máximo de lado (px): imagens maiores são reduzidas; menores ou iguais mantêm o tamanho (sem upscale).
 */
export const LOGO_PIXEL_SIZE = 256

/** Pausa entre cada equipa (getTeam + getMatch); ajuda a não saturar o HLTV. */
const DELAY_MS_BETWEEN_TEAMS = 150

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Nomes base dos imagesets no iOS (ex.: `natusvincere.imageset` → `natusvincere`),
 * para comparar com `fileNameFromTeamName`.
 */
export function loadExistingIosLogoKeys(iosTeamLogosDir: string): Set<string> {
  const set = new Set<string>()
  if (!fs.existsSync(iosTeamLogosDir)) {
    return set
  }
  for (const ent of fs.readdirSync(iosTeamLogosDir, { withFileTypes: true })) {
    if (ent.isDirectory() && ent.name.endsWith('.imageset')) {
      set.add(ent.name.replace(/\.imageset$/i, ''))
    }
  }
  return set
}

function fileNameFromTeamName(name: string): string {
  return name.trim().replace(/\s+/g, '').toLowerCase()
}

/** Extensões que este script pode gravar em disco (svg vira `.png`). */
const LOCAL_LOGO_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.svg'] as const

/**
 * Devolve o caminho se já existir `safeName` + ext numa das pastas (ordem: `dirs`).
 */
export function findExistingLogoInDirs(safeName: string, dirs: string[]): string | null {
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    for (const ext of LOCAL_LOGO_EXTENSIONS) {
      const p = path.join(dir, `${safeName}${ext}`)
      try {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
      } catch {
        /* ignora race / permissões */
      }
    }
  }
  return null
}

function findExistingLocalLogo(safeName: string): string | null {
  return findExistingLogoInDirs(safeName, [OUT_DIR_EXISTING, OUT_DIR_NEW])
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
 *   npx ts-node src/downloadRankingLogos.ts --matches
 *
 * Pastas no repo HLTV (comparado com `TeamLogos.xcassets/team-logos/*.imageset` no iOS):
 *   team-logos/     — nome sanitizado já existe como imageset no projeto iOS
 *   team-logos/new/ — ainda não há imageset correspondente (importar no Xcode)
 *
 * Caminho do xcassets (opcional): CSLIVESTATS_TEAM_LOGOS_XCASSETS
 *
 * Se já existir ficheiro local (`team-logos` ou `team-logos/new`), não chama HLTV nem faz download.
 *
 * Downloads gravam PNG; se largura ou altura > 256px, reduz para caber em 256×256 (inside, sem ampliar logos pequenos).
 */
type CliMode =
  | { mode: 'ranking' }
  | { mode: 'team'; teamId: number }
  | { mode: 'match'; matchId: number }
  | { mode: 'matches' }

function parseCli(): CliMode {
  const argv = process.argv.slice(2)
  let teamId: number | undefined
  let matchId: number | undefined
  let matchesList = false
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
    } else if (a === '--matches') {
      matchesList = true
    } else if (a === '-h' || a === '--help') {
      console.log(`downloadRankingLogos — exporta para ${OUT_DIR_EXISTING} (já no iOS) e ${OUT_DIR_NEW} (novos)
  (sem args)     ranking HLTV (comportamento original)
  -t, --team-id   id do clube
  -m, --match-id  id do jogo → logos dos dois clubes
      --matches   HLTV.getMatches (live + upcoming): logos de todos os clubes únicos`)
      process.exit(0)
    }
  }
  const picked = [teamId != null, matchId != null, matchesList].filter(Boolean).length
  if (picked > 1) {
    console.error('Usa só uma opção: --team-id, --match-id OU --matches')
    process.exit(1)
  }
  if (teamId != null) return { mode: 'team', teamId }
  if (matchId != null) return { mode: 'match', matchId }
  if (matchesList) return { mode: 'matches' }
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
  safeName: string,
  outDir: string
): Promise<string> {
  const dest = path.join(outDir, `${safeName}.png`)
  const asSvg = isLikelySvg(buffer, logoUrl)
  const pipeline = asSvg ? sharp(buffer, { density: 384 }) : sharp(buffer)

  await pipeline
    .resize(LOGO_PIXEL_SIZE, LOGO_PIXEL_SIZE, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 9 })
    .toFile(dest)

  return dest
}

async function downloadLogoForTeam(opts: {
  teamId: number
  teamName: string
  preferredLogo?: string | null
  rankingFallback?: string | null
  delayAfter: boolean
  iosExistingKeys: Set<string>
}): Promise<void> {
  const {
    teamId,
    teamName,
    preferredLogo,
    rankingFallback,
    delayAfter,
    iosExistingKeys,
  } = opts
  const safeName = fileNameFromTeamName(teamName)

  if (!safeName) {
    console.warn(`[skip] nome vazio após sanitizar: id=${teamId}`)
    if (delayAfter) await delay(DELAY_MS_BETWEEN_TEAMS)
    return
  }

  const existingLocal = findExistingLocalLogo(safeName)
  if (existingLocal) {
    console.log(
      `[skip] já existe local: ${teamName} → ${path.relative(REPO_ROOT, existingLocal)}`
    )
    return
  }

  const logoUrl = await resolveLogoUrlWithPreferred(teamId, preferredLogo, rankingFallback)

  if (!logoUrl) {
    console.warn(`[skip] sem logo resolvido: ${teamName} (id=${teamId})`)
    if (delayAfter) await delay(DELAY_MS_BETWEEN_TEAMS)
    return
  }

  const inIos = iosExistingKeys.has(safeName)
  const outDir = inIos ? OUT_DIR_EXISTING : OUT_DIR_NEW
  const tag = inIos ? 'ios' : 'novo'

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
    const dest = await writeLogoFile(buffer, logoUrl, safeName, outDir)
    console.log(`[ok] [${tag}] ${teamName} → ${path.relative(REPO_ROOT, dest)}`)
  } catch (err) {
    console.error(`[erro] ${teamName} (${logoUrl}):`, err)
  }

  if (delayAfter) await delay(DELAY_MS_BETWEEN_TEAMS)
}

async function runTeamId(teamId: number, iosExistingKeys: Set<string>): Promise<void> {
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
    iosExistingKeys,
  })
}

async function runMatchId(matchId: number, iosExistingKeys: Set<string>): Promise<void> {
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
      iosExistingKeys,
    })
  }
}

async function runRanking(iosExistingKeys: Set<string>): Promise<void> {
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
      iosExistingKeys,
    })
  }
}

/**
 * Baixa logos de todos os clubes presentes na lista atual de jogos
 * (live + upcoming) via `HLTV.getMatches()`. Dedupe por team id para
 * evitar chamar `getTeam` várias vezes para o mesmo clube.
 */
async function runMatches(iosExistingKeys: Set<string>): Promise<void> {
  const matches = await HLTV.getMatches()
  const seen = new Set<number>()
  const queue: Array<{ id: number; name: string; preferredLogo?: string | null }> = []

  // Contadores para auditoria — ajudam a confirmar que nada escapou.
  let slotsTotal = 0          // total de slots team1+team2 inspecionados
  let slotsEmpty = 0          // team1/team2 inteiramente undefined (placeholders tipo "Semifinal 1")
  let slotsTbd = 0            // time presente mas sem id (TBD/qualifier)
  let slotsNoName = 0         // id presente mas sem nome
  let slotsDuplicate = 0      // já está na fila (mesmo clube em vários jogos)

  for (const m of matches) {
    for (const t of [m.team1, m.team2]) {
      slotsTotal++
      if (!t) { slotsEmpty++; continue }
      if (!t.id || t.id === 0) { slotsTbd++; continue }
      if (!t.name) { slotsNoName++; continue }
      if (seen.has(t.id)) { slotsDuplicate++; continue }
      seen.add(t.id)
      queue.push({
        id: t.id,
        name: t.name,
        preferredLogo: t.logo != null && t.logo !== '' ? String(t.logo) : undefined,
      })
    }
  }

  console.log(
    `[matches] ${matches.length} jogos • ${slotsTotal} slots • ` +
      `${queue.length} únicos para baixar | ` +
      `ignorados: ${slotsEmpty} vazios + ${slotsTbd} TBD + ${slotsNoName} sem nome + ${slotsDuplicate} dups`
  )

  for (let i = 0; i < queue.length; i++) {
    const { id, name, preferredLogo } = queue[i]
    await downloadLogoForTeam({
      teamId: id,
      teamName: name,
      preferredLogo,
      delayAfter: i < queue.length - 1,
      iosExistingKeys,
    })
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR_EXISTING, { recursive: true })
  fs.mkdirSync(OUT_DIR_NEW, { recursive: true })

  const iosExistingKeys = loadExistingIosLogoKeys(IOS_TEAM_LOGOS_IMAGES_DIR)
  if (!fs.existsSync(IOS_TEAM_LOGOS_IMAGES_DIR)) {
    console.warn(
      `[aviso] Pasta iOS não encontrada: ${IOS_TEAM_LOGOS_IMAGES_DIR}\n` +
        '  Defina CSLIVESTATS_TEAM_LOGOS_XCASSETS ou clone o repo ao lado de HLTV. Todos os ficheiros vão para team-logos/new/.'
    )
  } else {
    console.log(`[ios] ${iosExistingKeys.size} imagesets em ${IOS_TEAM_LOGOS_IMAGES_DIR}`)
  }

  const cli = parseCli()
  if (cli.mode === 'team') {
    console.log(`[modo] team-id ${cli.teamId}`)
    await runTeamId(cli.teamId, iosExistingKeys)
    return
  }
  if (cli.mode === 'match') {
    console.log(`[modo] match-id ${cli.matchId}`)
    await runMatchId(cli.matchId, iosExistingKeys)
    return
  }
  if (cli.mode === 'matches') {
    console.log('[modo] matches (getMatches: live + upcoming)')
    await runMatches(iosExistingKeys)
    return
  }
  console.log('[modo] ranking completo')
  await runRanking(iosExistingKeys)
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
