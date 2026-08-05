/**
 * Kit dogfood — record share GIFs (local only).
 *
 * Setup once:
 *   bun apps/example-web/scripts/setup-release-gifs.mjs
 *
 * Record:
 *   bun apps/example-web/scripts/record-release-gifs.mjs
 *   RECORD_ONLY=02-changelog bun apps/example-web/scripts/record-release-gifs.mjs
 *
 * Env: PLAYWRIGHT_BASE_URL / E2E_BASE_URL, GIF_SPEED, GIF_FPS, CHROME_PATH
 * Requires: ffmpeg, ffprobe, Chromium, running app + seed.
 */
import { accessSync, constants as fsConstants, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { normalizeConfig } from '../../../tooling/release-gifs/config.mjs'
import { recordClip } from '../../../tooling/release-gifs/record-core.mjs'
import { kitScenarios } from './release-gifs-scenarios.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173'
const EMAIL = process.env.E2E_DEMO_EMAIL ?? 'demo@kit.local'
const PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'demo-password-change-me'
const OUT_DIR = join(ROOT, 'artifacts/release-gifs')
const STATE_PATH = join(OUT_DIR, '.auth-demo.json')

function fileExists(path) {
  try {
    accessSync(path, fsConstants.X_OK)
    return true
  } catch {
    try {
      accessSync(path, fsConstants.R_OK)
      return true
    } catch {
      return false
    }
  }
}

function resolveBrowserExecutable() {
  if (process.env.CHROME_PATH && fileExists(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH
  }
  try {
    const pw = chromium.executablePath()
    if (pw && fileExists(pw)) return pw
  } catch {
    /* empty */
  }
  for (const c of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (fileExists(c)) return c
  }
  throw new Error('No Chromium found. Install Playwright browsers or set CHROME_PATH.')
}

const only = (process.env.RECORD_ONLY || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const scenarios = only.length ? kitScenarios.filter((s) => only.includes(s.id)) : kitScenarios

if (!scenarios.length) {
  console.error(
    `No scenarios matched RECORD_ONLY=${process.env.RECORD_ONLY}. Known: ${kitScenarios.map((s) => s.id).join(', ')}`,
  )
  process.exit(1)
}

const cfg = normalizeConfig({
  baseURL: BASE,
  outDir: OUT_DIR,
  statePath: STATE_PATH,
  email: EMAIL,
  password: PASSWORD,
  postLoginPath: '/app',
})

mkdirSync(OUT_DIR, { recursive: true })
const executablePath = resolveBrowserExecutable()

console.log(`Recording against ${cfg.baseURL}`)
console.log(`  out: ${OUT_DIR}`)
console.log(`  scenarios: ${scenarios.map((s) => s.id).join(', ')}`)

const gifs = []
for (const s of scenarios) {
  gifs.push(
    await recordClip(cfg, {
      name: s.id,
      startPath: s.startPath,
      demo: s.demo,
      executablePath,
    }),
  )
}

console.log('\nDone:')
for (const g of gifs) console.log(' ', g)
console.log(
  '\nOptional: copy *-share.gif → apps/example-web/public/release-gifs/ and set Release.gifSrc',
)
