/**
 * Record one clip: Playwright video → webm → share GIF.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { runAuthSetup } from './auth-setup.mjs'
import { cookieUrlFromBase, normalizeConfig } from './config.mjs'
import { CURSOR_INIT_SCRIPT } from './cursor-init.mjs'
import { webmToGif } from './ffmpeg-gif.mjs'

const GLIDE_MS_PER_PX = Number(process.env.GIF_GLIDE_MS_PER_PX ?? '1.35')
const GLIDE_MS_MIN = Number(process.env.GIF_GLIDE_MS_MIN ?? '450')
const GLIDE_MS_MAX = Number(process.env.GIF_GLIDE_MS_MAX ?? '1400')

/**
 * @param {import('./config.mjs').ReleaseGifConfig} raw
 */
export async function ensureAuthState(raw) {
  const cfg = normalizeConfig(raw)
  if (existsSync(cfg.statePath)) {
    console.log(`• storageState exists: ${cfg.statePath}`)
    return
  }
  console.log('• storageState missing → runAuthSetup…')
  await runAuthSetup(cfg)
  if (!existsSync(cfg.statePath)) {
    throw new Error('Auth setup failed — storageState missing')
  }
}

/**
 * @param {import('playwright-core').Page} page
 */
export async function ensureCursor(page) {
  const ok = await page
    .evaluate(() => {
      if (typeof window.__pwDemoCursorEnsure === 'function') {
        window.__pwDemoCursorEnsure()
        return !!document.getElementById('pw-demo-cursor')
      }
      return !!document.getElementById('pw-demo-cursor')
    })
    .catch(() => false)
  if (!ok) {
    await page.evaluate(CURSOR_INIT_SCRIPT).catch(() => {})
    await page
      .evaluate(() => {
        if (typeof window.__pwDemoCursorEnsure === 'function') window.__pwDemoCursorEnsure()
      })
      .catch(() => {})
  }
}

function glideMsForDistance(distPx) {
  const ms = distPx * (Number.isFinite(GLIDE_MS_PER_PX) ? GLIDE_MS_PER_PX : 1.35)
  const min = Number.isFinite(GLIDE_MS_MIN) ? GLIDE_MS_MIN : 450
  const max = Number.isFinite(GLIDE_MS_MAX) ? GLIDE_MS_MAX : 1400
  return Math.round(Math.min(max, Math.max(min, ms)))
}

/**
 * @param {import('playwright-core').Page} page
 * @param {import('playwright-core').Locator} locator
 * @param {object} [opts]
 */
export async function moveClick(
  page,
  locator,
  { glideMs, settleMs, settleBeforeMs = 70, settleAfterMs = 200, clickHoldMs = 80 } = {},
) {
  const afterMs = settleMs ?? settleAfterMs
  await locator.waitFor({ state: 'visible', timeout: 20_000 })
  await locator.scrollIntoViewIfNeeded()
  await ensureCursor(page)
  const box = await locator.boundingBox()
  if (!box) {
    await locator.click()
    await page.waitForTimeout(afterMs)
    return
  }
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2

  const from = await page
    .evaluate(() =>
      typeof window.__pwDemoCursorGetPos === 'function'
        ? window.__pwDemoCursorGetPos()
        : window.__pwCursorPos || { x: 320, y: 200 },
    )
    .catch(() => ({ x: 320, y: 200 }))
  const dist = Math.hypot(x - from.x, y - from.y)
  const ms = glideMs ?? glideMsForDistance(dist)

  await page.evaluate(
    async ({ x: cx, y: cy, duration }) => {
      if (window.__pwDemoCursorGlide) {
        await window.__pwDemoCursorGlide(cx, cy, duration)
      } else if (window.__pwDemoCursorMove) {
        window.__pwDemoCursorMove(cx, cy)
      }
    },
    { x, y, duration: ms },
  )

  await page.mouse.move(x, y, { steps: 4 })
  if (settleBeforeMs > 0) await page.waitForTimeout(settleBeforeMs)

  await page.evaluate(() => {
    if (window.__pwDemoCursorClick) window.__pwDemoCursorClick(true)
  })
  await page.mouse.down()
  await page.waitForTimeout(clickHoldMs)
  await page.mouse.up()
  await page.evaluate(() => {
    if (window.__pwDemoCursorClick) window.__pwDemoCursorClick(false)
  })
  if (afterMs > 0) await page.waitForTimeout(afterMs)
}

/**
 * @param {import('./config.mjs').ReleaseGifConfig} raw
 * @param {{
 *   name: string
 *   startPath: string
 *   demo: (page: import('playwright-core').Page, helpers: { moveClick: typeof moveClick }) => Promise<void>
 *   stamp?: string
 *   executablePath?: string
 * }} clip
 */
export async function recordClip(raw, clip) {
  const cfg = normalizeConfig(raw)
  await ensureAuthState(cfg)

  const stamp = clip.stamp ?? new Date().toISOString().slice(0, 10)
  const videoDir = join(cfg.outDir, `_raw-${clip.name}`)
  mkdirSync(videoDir, { recursive: true })
  mkdirSync(cfg.outDir, { recursive: true })

  const launchOpts = { headless: true }
  if (clip.executablePath) launchOpts.executablePath = clip.executablePath

  const browser = await chromium.launch(launchOpts)
  const context = await browser.newContext({
    baseURL: cfg.baseURL,
    viewport: cfg.viewport,
    locale: cfg.locale,
    storageState: cfg.statePath,
    recordVideo: { dir: videoDir, size: cfg.viewport },
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

  await context.addInitScript(CURSOR_INIT_SCRIPT)
  const page = await context.newPage()

  try {
    await page.goto(clip.startPath, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    await ensureCursor(page)
    await page.waitForTimeout(800)
    await ensureCursor(page)

    await clip.demo(page, {
      moveClick: (loc, opts) => moveClick(page, loc, opts),
    })

    await page.waitForTimeout(1500)
    await ensureCursor(page)
  } catch (err) {
    const shot = join(cfg.outDir, `error-${clip.name}.png`)
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {})
    console.error(`screenshot: ${shot} url=${page.url()}`)
    throw err
  } finally {
    await page.close().catch(() => {})
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }

  const webms = readdirSync(videoDir).filter((f) => f.endsWith('.webm'))
  if (!webms.length) throw new Error(`No webm for ${clip.name}`)
  const webmPath = join(videoDir, webms[0])
  const outWebm = join(cfg.outDir, `${stamp}-${clip.name}.webm`)
  const outGif = join(cfg.outDir, `${stamp}-${clip.name}-share.gif`)
  copyFileSync(webmPath, outWebm)
  webmToGif(outWebm, outGif)
  rmSync(videoDir, { recursive: true, force: true })
  console.log(`✓ ${clip.name} → ${outGif}`)
  return outGif
}

/** Resolve monorepo tooling/release-gifs path from an app scripts/ caller. */
export function resolveToolingReleaseGifsDir(fromImportMetaUrl) {
  const here = dirname(fileURLToPath(fromImportMetaUrl))
  // apps/example-web/scripts → ../../../tooling/release-gifs
  return join(here, '../../../tooling/release-gifs')
}

/** Optional: re-run setup via node path for CLI convenience */
export function spawnAuthSetupScript(setupScriptPath, env = process.env) {
  const r = spawnSync(process.execPath, [setupScriptPath], {
    stdio: 'inherit',
    env,
  })
  if (r.status !== 0) throw new Error(`Setup script failed: ${setupScriptPath}`)
}
