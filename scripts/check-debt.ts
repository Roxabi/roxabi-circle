#!/usr/bin/env bun
/**
 * DEBT hygiene — untagged suppressions + expiry (CP-DEBT).
 *
 * Scans apps/ + packages/ for biome-ignore, ts-expect-error, and ts-ignore line markers.
 * Tagged form: … — DEBT:<slug> [#N]
 *
 * Env:
 *   DEBT_ROOT            monorepo root (self-test harness)
 *   DEBT_UNTAGGED_MODE   warn | fail  (default warn)
 *   DEBT_EXPIRY_MODE     off | warn | fail  (default warn)
 *   DEBT_EXPIRY_MONTHS   grace period months (default 6)
 *
 * Exit: 0 clean or warn-only findings · 1 fail-mode findings · 2 bad config
 *
 * Does NOT prove: line-level git blame age, biome.json overrides, tools/scripts ignores.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

// Gate scripts run outside Turbo task graph (same pattern as check-import-boundaries).
// biome-ignore lint/suspicious/noUndeclaredEnvVars: not a turbo-cached task env
const ROOT = resolve(process.env.DEBT_ROOT ?? join(import.meta.dirname, '..'))
// biome-ignore lint/suspicious/noUndeclaredEnvVars: not a turbo-cached task env
const UNTAGGED_MODE = (process.env.DEBT_UNTAGGED_MODE ?? 'warn').toLowerCase()
// biome-ignore lint/suspicious/noUndeclaredEnvVars: not a turbo-cached task env
const EXPIRY_MODE = (process.env.DEBT_EXPIRY_MODE ?? 'warn').toLowerCase()
// biome-ignore lint/suspicious/noUndeclaredEnvVars: not a turbo-cached task env
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
const ISSUE_RE = /#([0-9]{1,6})(?:\D|$)/

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

function gitFileDate(abs: string): string | null {
  const r = spawnSync('git', ['log', '--format=%ci', '-1', '--', abs], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  if (r.status !== 0) return null
  const line = (r.stdout ?? '').trim().split('\n')[0] ?? ''
  const day = line.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

function monthsAgoIso(months: number): string {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() - months)
  return d.toISOString().slice(0, 10)
}

function main(): void {
  const untaggedMode = parseMode(UNTAGGED_MODE, ['warn', 'fail'])
  const expiryMode = parseMode(EXPIRY_MODE, ['off', 'warn', 'fail'])

  if (!Number.isFinite(EXPIRY_MONTHS) || EXPIRY_MONTHS < 1) {
    console.error('ERROR: DEBT_EXPIRY_MONTHS must be a positive number')
    process.exit(2)
  }

  const files: string[] = []
  for (const root of SCAN_ROOTS) {
    walkSources(join(ROOT, root), files)
  }

  const untagged: Finding[] = []
  const debtLines: { abs: string; rel: string; line: number; text: string }[] = []

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
      if (!/(?:biome-ignore|@ts-expect-error|@ts-ignore)\b/.test(raw)) continue
      const trimmed = raw.trim()
      const isComment =
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        /\/\/\s*(?:biome-ignore|@ts-expect-error|@ts-ignore)\b/.test(raw)
      if (!isComment) continue

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

  const stale: Finding[] = []
  if (expiryMode !== 'off') {
    const cutoff = monthsAgoIso(EXPIRY_MONTHS)
    // Cache file dates per path
    const dateCache = new Map<string, string | null>()
    for (const hit of debtLines) {
      if (ISSUE_RE.test(hit.text)) continue
      let last = dateCache.get(hit.abs)
      if (last === undefined) {
        last = gitFileDate(hit.abs)
        dateCache.set(hit.abs, last)
      }
      if (last === null) continue // untracked / no history → not stale
      if (last > cutoff || last === cutoff) continue
      stale.push({
        kind: 'stale',
        file: hit.rel,
        line: hit.line,
        text: hit.text,
        detail: `file last commit ${last}, cutoff ${cutoff}`,
      })
    }
  }

  let hardFail = false

  if (untagged.length > 0) {
    const tag = untaggedMode === 'fail' ? 'FAIL' : 'WARN'
    console.error(`\n${tag}: ${untagged.length} untagged suppression(s) (need — DEBT:<slug>):`)
    for (const f of untagged) {
      console.error(`  ${f.file}:${f.line}: ${f.text}`)
    }
    console.error('  Fix: append " — DEBT:your-slug" (optional #issue) or remove the suppression.')
    console.error('  See docs/debt-tracking.md')
    if (untaggedMode === 'fail') hardFail = true
  }

  if (stale.length > 0) {
    const tag = expiryMode === 'fail' ? 'FAIL' : 'WARN'
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
    if (expiryMode === 'fail') hardFail = true
  }

  if (untagged.length === 0 && stale.length === 0) {
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
