import { Hono } from 'hono'
import { assertRateLimit } from '../lib/rate-limit'
import { requireAuth } from '../middleware/require-auth'
import { sendDemoEmail } from '../services/email'
import type { AppEnv } from '../types'

/** 10 demo emails / subject / hour (demo in-memory). */
const EMAIL_LIMIT = 10
const EMAIL_WINDOW_MS = 60 * 60 * 1000

export const demoRoutes = new Hono<AppEnv>()

demoRoutes.use('/api/demo/*', requireAuth)

demoRoutes.post('/api/demo/email', async (c) => {
  const subject = c.get('subject') || 'unknown'
  assertRateLimit(`email:${subject}`, EMAIL_LIMIT, EMAIL_WINDOW_MS)
  const result = await sendDemoEmail(c.env, subject)
  return c.json({ ...result, requestId: c.get('requestId') })
})
