import { AppError, toApiErrorBody } from '@gosilex/core'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { corsAllowlist } from './lib/session-env'
import { withDb } from './middleware/db'
import { onError } from './middleware/error-handler'
import { originGuard } from './middleware/origin-guard'
import { requestIdMiddleware } from './middleware/request-id'
import { applySecurityHeaders, securityHeaders } from './middleware/security-headers'
import { authRoutes } from './routes/auth'
import { demoRoutes } from './routes/demo'
import { healthRoutes } from './routes/health'
import { meRoutes } from './routes/me'
import { notesRoutes } from './routes/notes'
import type { AppEnv } from './types'

export { corsAllowlist, environmentName, getSecret, useSecureCookie } from './lib/session-env'
export type { AppEnv }

/** Factory used by Worker entry and unit tests (same shipped app). */
export function createApp() {
  const app = new Hono<AppEnv>()

  app.use('*', requestIdMiddleware)
  app.use('*', securityHeaders)
  app.use(
    '*',
    cors({
      origin: (origin, c) => {
        const list = corsAllowlist(c.env)
        if (!origin) return list[0] ?? 'http://localhost:5173'
        return list.includes(origin) ? origin : null
      },
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
      // SPA must be able to read Retry-After on 429 (credentials + expose).
      exposeHeaders: ['x-request-id', 'Retry-After'],
    }),
  )
  app.use('*', originGuard)
  app.use('*', withDb)
  app.onError((err, c) => onError(err, c))
  app.notFound((c) => {
    const requestId = c.get('requestId') || 'req_unknown'
    const { body, status } = toApiErrorBody(AppError.notFound(), requestId)
    applySecurityHeaders(c)
    return c.json(body, status as ContentfulStatusCode)
  })

  // routes → services → repos (secondary axis)
  app.route('/', healthRoutes)
  app.route('/', authRoutes)
  app.route('/', meRoutes)
  app.route('/', notesRoutes)
  app.route('/', demoRoutes)

  return app
}
