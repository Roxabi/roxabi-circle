/**
 * Local auth setup for release GIF recording (Better Auth email sign-in).
 * Writes storageState; agent hint never includes password.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { cookieUrlFromBase, normalizeConfig } from './config.mjs'

/**
 * @param {import('./config.mjs').ReleaseGifConfig} raw
 * @param {{ executablePath?: string }} [browserOpts]
 */
export async function runAuthSetup(raw, browserOpts = {}) {
  const cfg = normalizeConfig(raw)
  mkdirSync(cfg.outDir, { recursive: true })

  console.log('→ setup release GIFs')
  console.log(`  base: ${cfg.baseURL}`)
  console.log(`  user: ${cfg.email}`)
  console.log(`  state: ${cfg.statePath}`)

  try {
    const res = await fetch(new URL('/login', cfg.baseURL).href, {
      redirect: 'manual',
      signal: AbortSignal.timeout(5_000),
    })
    if (res.status >= 500) throw new Error(`HTTP ${res.status}`)
  } catch (e) {
    console.error(
      `\n✗ App unreachable at ${cfg.baseURL}\n  Start API + web (kit: :8787 + :5173) and seed first.\n`,
      e instanceof Error ? e.message : e,
    )
    process.exit(1)
  }

  const launchOpts = { headless: true }
  if (browserOpts.executablePath) launchOpts.executablePath = browserOpts.executablePath

  const browser = await chromium.launch(launchOpts)
  const context = await browser.newContext({
    baseURL: cfg.baseURL,
    viewport: cfg.viewport,
    locale: cfg.locale,
  })

  if (cfg.extraCookies?.length) {
    await context.addCookies(
      cfg.extraCookies.map((c) => ({
        name: c.name,
        value: c.value,
        url: cookieUrlFromBase(cfg.baseURL),
        httpOnly: false,
        sameSite: 'Lax',
      })),
    )
  }

  let signedIn = false
  for (let attempt = 1; attempt <= 6; attempt++) {
    const response = await context.request.post('/api/auth/sign-in/email', {
      data: { email: cfg.email, password: cfg.password },
      headers: {
        'content-type': 'application/json',
        origin: cookieUrlFromBase(cfg.baseURL),
        referer: `${cfg.baseURL}/login`,
      },
    })
    if (response.status() === 429) {
      console.log(`  rate limit, retry ${attempt}/6…`)
      await new Promise((r) => setTimeout(r, 12_000))
      continue
    }
    if (!response.ok()) {
      const body = await response.text().catch(() => '')
      throw new Error(`Login HTTP ${response.status()} — seed ran? body=${body.slice(0, 200)}`)
    }
    signedIn = true
    console.log(`  ✓ sign-in API OK (HTTP ${response.status()})`)
    break
  }
  if (!signedIn) throw new Error('Rate limit /sign-in/email after 6 attempts')

  const page = await context.newPage()
  const post = cfg.postLoginPath || '/app'
  await page.goto(post, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})

  if (cfg.extraCookies?.length) {
    await context.addCookies(
      cfg.extraCookies.map((c) => ({
        name: c.name,
        value: c.value,
        url: cookieUrlFromBase(cfg.baseURL),
        httpOnly: false,
        sameSite: 'Lax',
      })),
    )
  }

  await context.storageState({ path: cfg.statePath })
  await browser.close()

  // Hint for agents — never include password
  const agentHint = {
    baseURL: cfg.baseURL,
    storageState: cfg.statePath,
    cookies: (cfg.extraCookies || []).map((c) => ({ name: c.name, value: c.value })),
    demoUser: { email: cfg.email },
    note: 'Load storageState before capture. Login API: POST /api/auth/sign-in/email (password via env only).',
  }
  const hintPath = join(cfg.outDir, 'agent-browser.hint.json')
  writeFileSync(hintPath, `${JSON.stringify(agentHint, null, 2)}\n`)

  console.log(`\n✓ storageState → ${cfg.statePath}`)
  console.log(`✓ hint agent   → ${hintPath} (no password)`)
  return { statePath: cfg.statePath, hintPath }
}
