/**
 * Kit dogfood scenarios only — products define their own.
 */

/**
 * @type {Array<{
 *   id: string
 *   startPath: string
 *   demo: (page: import('playwright-core').Page, h: { moveClick: Function }) => Promise<void>
 * }>}
 */
export const kitScenarios = [
  {
    id: '01-notes',
    startPath: '/app/notes',
    demo: async (page, { moveClick }) => {
      // Notes list or empty state — keep short
      const heading = page.getByRole('heading').first()
      await heading.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {})
      await page.waitForTimeout(400)
      const newBtn = page.getByRole('button', { name: /nouvelle|new|créer|create|note/i }).first()
      if (await newBtn.isVisible().catch(() => false)) {
        await moveClick(newBtn)
        await page.waitForTimeout(600)
        await page.keyboard.press('Escape').catch(() => {})
      } else {
        // Scroll list area for motion
        await page.mouse.wheel(0, 200)
        await page.waitForTimeout(500)
        await page.mouse.wheel(0, -100)
      }
      await page.waitForTimeout(400)
    },
  },
  {
    id: '02-changelog',
    startPath: '/app/changelog',
    demo: async (page, { moveClick }) => {
      const title = page.getByRole('heading', { name: /nouveautés|what.?s new|changelog/i }).first()
      await title.waitFor({ state: 'visible', timeout: 30_000 }).catch(async () => {
        // Fallback: any page content
        await page.locator('body').waitFor({ state: 'visible' })
      })
      await page.waitForTimeout(500)
      // Open avatar menu then return — optional navigation demo
      const trigger = page
        .locator('[data-slot="sidebar-menu-button"]')
        .filter({ hasText: /@/ })
        .first()
      // Prefer sparkles/menu path: just scroll the release cards
      const cards = page.locator('[data-slot="card"], .rounded-xl, article')
      if ((await cards.count()) > 0) {
        await moveClick(cards.first())
        await page.waitForTimeout(400)
      } else {
        await page.mouse.wheel(0, 120)
        await page.waitForTimeout(400)
      }
      // Avoid unused if trigger missing
      if (await trigger.isVisible().catch(() => false)) {
        await moveClick(trigger)
        await page.waitForTimeout(300)
        await page.keyboard.press('Escape').catch(() => {})
      }
      await page.waitForTimeout(500)
    },
  },
]
