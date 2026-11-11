import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { AppError } from '@kit/core'
import { authErrorResponses, sessionOrKeySecurity } from '../lib/openapi'
import { requireAuth } from '../middleware/require-auth'
import type { AppEnv } from '../types'

const pingNoQueueSchema = z
  .object({
    ok: z.literal(true),
    enqueued: z.literal(false),
    reason: z.string(),
    requestId: z.string(),
  })
  .openapi('JobPingNoQueue')

const pingEnqueuedSchema = z
  .object({
    ok: z.literal(true),
    enqueued: z.literal(true),
    requestId: z.string(),
  })
  .openapi('JobPingEnqueued')

export const jobsRoutes = new OpenAPIHono<AppEnv>()

jobsRoutes.use('/api/jobs/*', requireAuth)
jobsRoutes.use('/api/jobs', requireAuth)

const pingJob = createRoute({
  method: 'post',
  path: '/api/jobs/ping',
  tags: ['jobs'],
  summary: 'Enqueue a demo.ping job (no-op when DEMO_QUEUE is unbound)',
  security: sessionOrKeySecurity,
  responses: {
    200: {
      description: 'Auth-gated no-op — DEMO_QUEUE binding absent',
      content: { 'application/json': { schema: pingNoQueueSchema } },
    },
    202: {
      description: 'demo.ping enqueued',
      content: { 'application/json': { schema: pingEnqueuedSchema } },
    },
    ...authErrorResponses,
  },
})

jobsRoutes.openapi(pingJob, async (c) => {
  const queue = c.env.DEMO_QUEUE
  if (!queue || typeof queue.send !== 'function') {
    // Local/CI without binding — still auth-gated, return ok with no-op
    return c.json(
      {
        ok: true as const,
        enqueued: false as const,
        reason: 'DEMO_QUEUE binding absent',
        requestId: c.get('requestId'),
      },
      200,
    )
  }
  try {
    await queue.send({
      type: 'demo.ping',
      at: Date.now(),
      subject: c.get('subject'),
    })
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'demo_queue_send_failed',
        error: err instanceof Error ? err.message : String(err),
      }),
    )
    throw AppError.internal('Failed to enqueue demo.ping')
  }
  return c.json({ ok: true as const, enqueued: true, requestId: c.get('requestId') }, 202)
})
