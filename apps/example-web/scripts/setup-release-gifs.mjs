/**
 * Kit dogfood — storageState for release GIF recording.
 *
 * Prereqs:
 *   bun run db:migrate && bun run db:seed
 *   apps/example-api dev → :8787
 *   apps/example-web dev → :5173
 *
 * Usage:
 *   bun apps/example-web/scripts/kit/setup-release-gifs.mjs
 *   # or: bun run --filter @kit/example-web setup:release-gifs
 */
import { accessSync, constants as fsConstants, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { runAuthSetup } from '../../../tooling/release-gifs/auth-setup.mjs'

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

mkdirSync(OUT_DIR, { recursive: true })

await runAuthSetup(
  {
    baseURL: BASE,
    outDir: OUT_DIR,
    statePath: STATE_PATH,
    email: EMAIL,
    password: PASSWORD,
    postLoginPath: '/app',
  },
  { executablePath: resolveBrowserExecutable() },
)

console.log('\nEnsuite:\n  bun apps/example-web/scripts/kit/record-release-gifs.mjs\n')
