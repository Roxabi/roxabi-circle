import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { assertRateLimit } from '@kit/auth/repos/rate-limit'
import { authErrorResponses, rateLimitErrorResponse, sessionOrKeySecurity } from '../lib/openapi'
import { requireAuth } from '../middleware/require-auth'
import { sendDemoEmail } from '../services/email'
import type { AppEnv } from '../types'

/** 10 demo emails / subject / hour (D1 fixed-window). */
const EMAIL_LIMIT = 10
const EMAIL_WINDOW_MS = 60 * 60 * 1000

export const demoRoutes = new OpenAPIHono<AppEnv>()

demoRoutes.use('/api/demo/*', requireAuth)

const sendEmail = createRoute({
  method: 'post',
  path: '/api/demo/email',
  tags: ['demo'],
  summary: 'Send a demo email (rate-limited)',
  security: sessionOrKeySecurity,
  responses: {
    200: {
      description: 'Demo email accepted by the configured transport',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean(),
            transport: z.string(),
            to: z.string(),
            requestId: z.string(),
          }),
        },
      },
    },
    ...authErrorResponses,
    ...rateLimitErrorResponse,
  },
})

demoRoutes.openapi(sendEmail, async (c) => {
  const subject = c.get('subject') || 'unknown'
  const db = c.get('db')!
  await assertRateLimit(db, `email:${subject}`, EMAIL_LIMIT, EMAIL_WINDOW_MS)
  const result = await sendDemoEmail(c.env, subject)
  return c.json({ ...result, requestId: c.get('requestId') })
})
