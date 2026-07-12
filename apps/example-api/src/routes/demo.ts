import { Hono } from 'hono'
import { requireAuth } from '../middleware/require-auth'
import { sendDemoEmail } from '../services/email'
import type { AppEnv } from '../types'

export const demoRoutes = new Hono<AppEnv>()

demoRoutes.use('*', requireAuth)

demoRoutes.post('/api/demo/email', async (c) => {
  const result = await sendDemoEmail(c.env, c.get('subject') || 'unknown')
  return c.json({ ...result, requestId: c.get('requestId') })
})
