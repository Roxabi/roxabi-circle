/**
 * Browser smoke for design-system overlays (and admin gate).
 * Fails on pageerror / console Base UI contract messages.
 *
 * Prerequisites:
 *   1. bun run db:migrate && bun run db:seed  (once)
 *   2. apps/example-api: bun run dev  → :8787
 *   3. apps/example-web: bun run dev  → :5173 (host binds 127.0.0.1 + localhost)
 *   4. Chrome at CHROME_PATH (default /usr/bin/google-chrome)
 *
 * Usage:
 *   bun apps/example-web/scripts/e2e-design-system.mjs
 *   # or: bun run --filter @gosilex/example-web test:e2e:design-system
 */
import { chromium } from 'playwright-core'

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173'
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:8787'
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome'

const pageErrors = []
const consoleErrors = []

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
page.on('pageerror', (err) => pageErrors.push(String(err)))
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})

function assertClean(phase) {
  const all = [...pageErrors, ...consoleErrors]
  const bad = all.filter((m) =>
    /Base UI|MenuGroupContext|must be used within|DialogRootContext|TypeError|ReferenceError/i.test(
      m,
    ),
  )
  if (bad.length) {
    console.error(`E2E FAIL (${phase}):`, bad)
    process.exitCode = 1
    throw new Error(bad.join('\n'))
  }
}

try {
  // Login as platform admin via Better Auth (ADR-0002) from page origin (cookie on 5173 proxy)
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.evaluate(async () => {
    localStorage.setItem('gosilex.theme', 'light')
    document.documentElement.classList.remove('dark')
    const res = await fetch('/api/auth/sign-in/email', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'demo@gosilex.local',
        password: 'demo-password-change-me',
      }),
    })
    if (!res.ok) throw new Error(`login ${res.status}`)
    const me = await fetch('/api/me', { credentials: 'include' })
    if (!me.ok) throw new Error(`me ${me.status}`)
  })
  assertClean('login')

  await page.goto(`${BASE}/admin/design-system#overlays`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  assertClean('design-system load')

  // Open dropdown in overlays section
  const dropdownBtn = page.getByRole('button', { name: 'Dropdown' })
  await dropdownBtn.click()
  await page.waitForTimeout(300)
  await page
    .locator('[data-slot="dropdown-menu-label"]')
    .filter({ hasText: 'Actions' })
    .waitFor({ state: 'visible', timeout: 3000 })
  assertClean('dropdown open')

  // Open dialog
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Open Dialog' }).click()
  await page
    .locator('[data-slot="dialog-title"]')
    .filter({ hasText: 'Dialog reference' })
    .waitFor({ state: 'visible', timeout: 3000 })
  assertClean('dialog open')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)

  // Open sheet
  await page.getByRole('button', { name: 'Open Sheet' }).click()
  await page
    .locator('[data-slot="sheet-title"]')
    .filter({ hasText: 'Sheet reference' })
    .waitFor({ state: 'visible', timeout: 3000 })
  assertClean('sheet open')

  console.log(
    JSON.stringify({
      ok: true,
      base: BASE,
      api: API,
      pageErrors: pageErrors.length,
      consoleErrors: consoleErrors.length,
    }),
  )
} finally {
  await browser.close()
}

if (process.exitCode) process.exit(process.exitCode)
