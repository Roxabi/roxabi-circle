#!/usr/bin/env bun
/**
 * DEBT hygiene — untagged suppressions + expiry (CP-DEBT).
 *
 * Scans apps/ + packages/ for biome-ignore, ts-expect-error, and ts-ignore line markers.
 * Tagged form: … — DEBT:<slug> [#N]
 *
 * Env:
 *   DEBT_ROOT            monorepo root (self-test harness)
 *   DEBT_UNTAGGED_MODE   warn | fail  (default fail)
 *   DEBT_EXPIRY_MODE     off | warn | fail  (default warn)
 *   DEBT_EXPIRY_MONTHS   grace period months (default 6)
 *
 * Exit: 0 clean or warn-only findings · 1 fail-mode finding or Git check failure · 2 bad config
 *
 * Does NOT prove: line-level git blame age, biome.json overrides, tools/scripts ignores.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

// Gate scripts run outside Turbo task graph (same pattern as check-import-boundaries).
const ROOT = resolve(process.env.DEBT_ROOT ?? join(import.meta.dirname, '../..'))
const UNTAGGED_MODE = (process.env.DEBT_UNTAGGED_MODE ?? 'fail').toLowerCase()
const EXPIRY_MODE = (process.env.DEBT_EXPIRY_MODE ?? 'warn').toLowerCase()
const EXPIRY_MONTHS = Number(process.env.DEBT_EXPIRY_MONTHS ?? '6')

const SCAN_ROOTS = ['apps', 'packages']
const SOURCE_EXT = new Set(['.ts', '.tsx'])
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.wrangler',
  'coverage',
  '.git',
  '.turbo',
  'build',
  'generated',
])

const DEBT_RE = /(?:—|--?)\s*DEBT:([a-z0-9]+(?:-[a-z0-9]+)*)\b/
/** Issue pin only immediately after DEBT:<slug> (not bare #rgb elsewhere on the line). */
const ISSUE_PIN_RE = /DEBT:[a-z0-9]+(?:-[a-z0-9]+)*\s+#([0-9]{1,6})\b/

type Mode = 'off' | 'warn' | 'fail'

type Finding = {
  kind: 'untagged' | 'stale'
  file: string
  line: number
  text: string
  detail?: string
}

function parseMode(raw: string, allowed: Mode[]): Mode {
  if ((allowed as string[]).includes(raw)) return raw as Mode
  console.error(`ERROR: invalid mode '${raw}' (allowed: ${allowed.join('|')})`)
  process.exit(2)
}

function isSourceFile(name: string): boolean {
  if (name.endsWith('.d.ts')) return false
  const dot = name.lastIndexOf('.')
  if (dot < 0) return false
  return SOURCE_EXT.has(name.slice(dot))
}

function walkSources(dir: string, out: string[]): void {
  if (!existsSync(dir)) return
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const ent of entries) {
    if (SKIP_DIRS.has(ent)) continue
    const abs = join(dir, ent)
    let st: ReturnType<typeof statSync>
    try {
      st = statSync(abs)
    } catch {
      continue
    }
    if (st.isDirectory()) walkSources(abs, out)
    else if (st.isFile() && isSourceFile(ent)) out.push(abs)
  }
}

function relPosix(abs: string): string {
  return relative(ROOT, abs).split(sep).join('/')
}

type GitFileDate = { ok: true; date: string | null } | { ok: false; detail: string }

function isIsoDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const parsed = new Date(`${day}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === day
}

function gitFileDate(abs: string): GitFileDate {
  const r = spawnSync('git', ['log', '--no-show-signature', '--format=%ci', '-1', '--', abs], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  if (r.error) return { ok: false, detail: r.error.message }
  if (r.status !== 0) {
    const fallback = r.status === null ? `signal ${r.signal ?? 'unknown'}` : `status ${r.status}`
    const stderr = (r.stderr ?? '').trim().split('\n')[0] ?? ''
    return { ok: false, detail: stderr || fallback }
  }
  const stdout = r.stdout ?? ''
  if (stdout === '') return { ok: true, date: null }
  const line = stdout.split('\n')[0] ?? ''
  const day = line.slice(0, 10)
  if (!isIsoDay(day)) return { ok: false, detail: `invalid date '${line.slice(0, 80)}'` }
  return { ok: true, date: day }
}

function monthsAgoIso(months: number): string {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() - months)
  return d.toISOString().slice(0, 10)
}

const CEILING_FILE = 'config/kit/debt-ceilings.json'
/** Trees where a biome-ignore still suppresses the rule, including gate scripts. */
const CEILING_ROOTS = ['apps', 'packages', 'scripts', 'tooling']
const CEILING_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.mjs', '.js'])
/** Family that must stay ratcheted. A missing ceiling file must not reopen it. */
const REQUIRED_FAMILY = 'cog-'

type CeilingFamily = { prefix: string; max: number }
type CeilingHit = { file: string; line: number; slug: string }

function loadCeilings(): { families: CeilingFamily[] } | 'missing' | 'bad' {
  const path = join(ROOT, CEILING_FILE)
  if (!existsSync(path)) return 'missing'
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return 'bad'
  }
  if (
    raw === null ||
    typeof raw !== 'object' ||
    !Array.isArray((raw as { families?: unknown }).families)
  ) {
    return 'bad'
  }
  const families: CeilingFamily[] = []
  for (const row of (raw as { families: unknown[] }).families) {
    if (row === null || typeof row !== 'object') return 'bad'
    const prefix = (row as { prefix?: unknown }).prefix
    const max = (row as { max?: unknown }).max
    if (typeof prefix !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*-$/.test(prefix)) return 'bad'
    if (typeof max !== 'number' || !Number.isInteger(max) || max < 0) return 'bad'
    families.push({ prefix, max })
  }
  return { families }
}

function fileStat(abs: string): ReturnType<typeof statSync> | null {
  try {
    return statSync(abs)
  } catch {
    return null
  }
}

function walkCeiling(dir: string, out: string[]): void {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const abs = join(dir, entry)
    const st = fileStat(abs)
    if (!st) continue
    if (st.isDirectory()) walkCeiling(abs, out)
    else if (CEILING_EXT.has(entry.slice(entry.lastIndexOf('.')))) out.push(abs)
  }
}

function hitsInFile(abs: string, prefix: string): CeilingHit[] {
  let text: string
  try {
    text = readFileSync(abs, 'utf8')
  } catch {
    return []
  }
  const hits: CeilingHit[] = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? ''
    if (!raw.includes('biome-ignore')) continue
    const debt = DEBT_RE.exec(raw)
    const slug = debt?.[1] ?? ''
    if (!slug.startsWith(prefix)) continue
    hits.push({ file: relPosix(abs), line: i + 1, slug })
  }
  return hits
}

function collectFamily(prefix: string): CeilingHit[] {
  const files: string[] = []
  for (const root of CEILING_ROOTS) walkCeiling(join(ROOT, root), files)
  const hits = files.flatMap((abs) => hitsInFile(abs, prefix))
  hits.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line))
  return hits
}

function printHits(hits: CeilingHit[]): void {
  for (const hit of hits) console.error(`  ${hit.file}:${hit.line}: DEBT:${hit.slug}`)
}

function reportMismatch(family: CeilingFamily, hits: CeilingHit[]): boolean {
  if (hits.length > family.max) {
    console.error(`\nFAIL: ${family.prefix} ceiling ${family.max}, found ${hits.length}:`)
    printHits(hits)
    return true
  }
  if (hits.length < family.max) {
    console.error(
      `\nFAIL: lower the ceiling to ${hits.length} (${family.prefix} found ${hits.length}, ceiling ${family.max})`,
    )
    return true
  }
  console.log(`ceiling ${family.prefix} ${hits.length}`)
  return false
}

function reportMissingCeiling(hits: CeilingHit[]): boolean {
  if (hits.length === 0) return false
  console.error(
    `\nFAIL: ${hits.length} ${REQUIRED_FAMILY} marker(s) but ${CEILING_FILE} is missing:`,
  )
  printHits(hits)
  return true
}

function reportUncovered(hits: CeilingHit[]): boolean {
  if (hits.length === 0) return false
  console.error(
    `\nFAIL: ${hits.length} ${REQUIRED_FAMILY} marker(s) not covered by ${CEILING_FILE}:`,
  )
  printHits(hits)
  return true
}

/** Ratchet: count must equal the ceiling. Over names every site; under names the new max. */
function enforceCeilings(): boolean {
  const loaded = loadCeilings()
  const required = collectFamily(REQUIRED_FAMILY)
  if (loaded === 'missing') return reportMissingCeiling(required)
  if (loaded === 'bad') {
    console.error(`\nFAIL: ${CEILING_FILE} is missing or not a families list`)
    return true
  }
  const covered = new Set<string>()
  let hard = false
  for (const family of loaded.families) {
    const hits = collectFamily(family.prefix)
    for (const hit of hits) covered.add(`${hit.file}:${hit.line}`)
    if (reportMismatch(family, hits)) hard = true
  }
  const uncovered = required.filter((hit) => !covered.has(`${hit.file}:${hit.line}`))
  if (reportUncovered(uncovered)) hard = true
  return hard
}

type DebtLine = { abs: string; rel: string; line: number; text: string }

function collectScanFiles(): string[] {
  const files: string[] = []
  for (const root of SCAN_ROOTS) {
    walkSources(join(ROOT, root), files)
  }
  return files
}

function isSuppressionComment(raw: string, trimmed: string): boolean {
  if (!/(?:biome-ignore|@ts-expect-error|@ts-ignore)\b/.test(raw)) return false
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    /\/\/\s*(?:biome-ignore|@ts-expect-error|@ts-ignore)\b/.test(raw)
  )
}

function scanSuppressions(files: string[]): { untagged: Finding[]; debtLines: DebtLine[] } {
  const untagged: Finding[] = []
  const debtLines: DebtLine[] = []
  for (const abs of files) {
    const rel = relPosix(abs)
    let text: string
    try {
      text = readFileSync(abs, 'utf8')
    } catch {
      continue
    }
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i] ?? ''
      const trimmed = raw.trim()
      if (!isSuppressionComment(raw, trimmed)) continue
      const debt = DEBT_RE.exec(raw)
      if (!debt) {
        untagged.push({
          kind: 'untagged',
          file: rel,
          line: i + 1,
          text: trimmed.slice(0, 160),
        })
      } else {
        debtLines.push({ abs, rel, line: i + 1, text: trimmed.slice(0, 160) })
      }
    }
  }
  return { untagged, debtLines }
}

type GitFailure = { file: string; detail: string }

function findStale(
  debtLines: DebtLine[],
  expiryMode: string,
): { stale: Finding[]; gitFailures: GitFailure[] } {
  if (expiryMode === 'off') return { stale: [], gitFailures: [] }
  const cutoff = monthsAgoIso(EXPIRY_MONTHS)
  const dateCache = new Map<string, GitFileDate>()
  const stale: Finding[] = []
  const gitFailures: GitFailure[] = []
  const reportedFailures = new Set<string>()
  for (const hit of debtLines) {
    if (ISSUE_PIN_RE.test(hit.text)) continue
    let result = dateCache.get(hit.abs)
    if (result === undefined) {
      result = gitFileDate(hit.abs)
      dateCache.set(hit.abs, result)
    }
    if (!result.ok) {
      if (!reportedFailures.has(hit.abs)) {
        gitFailures.push({ file: hit.rel, detail: result.detail })
        reportedFailures.add(hit.abs)
      }
      continue
    }
    if (result.date === null) continue // untracked / no history → not stale
    if (result.date >= cutoff) continue
    stale.push({
      kind: 'stale',
      file: hit.rel,
      line: hit.line,
      text: hit.text,
      detail: `file last commit ${result.date}, cutoff ${cutoff}`,
    })
  }
  return { stale, gitFailures }
}

function reportUntagged(untagged: Finding[], mode: string): boolean {
  if (untagged.length === 0) return false
  const tag = mode === 'fail' ? 'FAIL' : 'WARN'
  console.error(`\n${tag}: ${untagged.length} untagged suppression(s) (need — DEBT:<slug>):`)
  for (const f of untagged) {
    console.error(`  ${f.file}:${f.line}: ${f.text}`)
  }
  console.error('  Fix: append " — DEBT:your-slug" (optional #issue) or remove the suppression.')
  console.error('  See docs/kit/debt-tracking.md')
  return mode === 'fail'
}

function reportStale(stale: Finding[], mode: string): boolean {
  if (stale.length === 0) return false
  const tag = mode === 'fail' ? 'FAIL' : 'WARN'
  console.error(
    `\n${tag}: ${stale.length} stale DEBT marker(s) (>${EXPIRY_MONTHS} months, no #issue):`,
  )
  for (const f of stale) {
    console.error(`  ${f.file}:${f.line}: ${f.text}`)
    if (f.detail) console.error(`    (${f.detail})`)
  }
  console.error(
    '  Fix: resolve debt · add #<issue> on the line · or meaningful touch to reset clock.',
  )
  return mode === 'fail'
}

function reportGitFailures(gitFailures: GitFailure[]): boolean {
  if (gitFailures.length === 0) return false
  for (const failure of gitFailures) {
    console.error(`\nFAIL: Git failure for ${failure.file}: ${failure.detail}`)
  }
  return true
}

function main(): void {
  const untaggedMode = parseMode(UNTAGGED_MODE, ['warn', 'fail'])
  const expiryMode = parseMode(EXPIRY_MODE, ['off', 'warn', 'fail'])

  if (!Number.isFinite(EXPIRY_MONTHS) || EXPIRY_MONTHS < 1) {
    console.error('ERROR: DEBT_EXPIRY_MONTHS must be a positive number')
    process.exit(2)
  }

  const { untagged, debtLines } = scanSuppressions(collectScanFiles())
  const { stale, gitFailures } = findStale(debtLines, expiryMode)
  let hardFail = enforceCeilings()
  if (reportGitFailures(gitFailures)) hardFail = true
  if (reportUntagged(untagged, untaggedMode)) hardFail = true
  if (reportStale(stale, expiryMode)) hardFail = true

  if (untagged.length === 0 && stale.length === 0 && gitFailures.length === 0) {
    console.log(
      `check-debt: clean (untagged=${untaggedMode}, expiry=${expiryMode}, months=${EXPIRY_MONTHS}) — OK`,
    )
  } else if (!hardFail) {
    console.log(
      `check-debt: ${untagged.length} untagged, ${stale.length} stale (warn only) — exit 0`,
    )
  }

  process.exit(hardFail ? 1 : 0)
}

main()
