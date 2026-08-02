import { AppError } from '@gosilex/core'
import { Hono } from 'hono'
import { requireAuth } from '../middleware/require-auth'
import type { AppEnv } from '../types'

type QueueLike = { send: (body: unknown) => Promise<void> }

export const jobsRoutes = new Hono<AppEnv>()

jobsRoutes.use('/api/jobs/*', requireAuth)
jobsRoutes.use('/api/jobs', requireAuth)

jobsRoutes.post('/api/jobs/ping', async (c) => {
  const queue = (c.env as { DEMO_QUEUE?: QueueLike }).DEMO_QUEUE
  if (!queue || typeof queue.send !== 'function') {
    // Local/CI without binding — still auth-gated, return ok with no-op
    return c.json({
      ok: true,
      enqueued: false,
      reason: 'DEMO_QUEUE binding absent',
      requestId: c.get('requestId'),
    })
  }
  try {
    await queue.send({
      type: 'demo.ping',
      at: Date.now(),
      subject: c.get('subject'),
    })
  } catch (err) {
    throw AppError.internal('Failed to enqueue demo.ping', err)
  }
  return c.json({ ok: true, enqueued: true, requestId: c.get('requestId') }, 202)
})
