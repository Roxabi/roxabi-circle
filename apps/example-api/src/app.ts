import { AppError, toApiErrorBody } from '@kit/core'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { corsAllowlist } from './lib/session-env'
import { withBetterAuth } from './middleware/better-auth'
import { withDb } from './middleware/db'
import { onError } from './middleware/error-handler'
import { originGuard } from './middleware/origin-guard'
import { requestIdMiddleware } from './middleware/request-id'
import { applySecurityHeaders, securityHeaders } from './middleware/security-headers'
import { adminAuditRoutes } from './routes/admin-audit'
import { adminUsersRoutes } from './routes/admin-users'
import { authRoutes } from './routes/auth'
import { demoRoutes } from './routes/demo'
import { healthRoutes } from './routes/health'
import { invitationsRoutes } from './routes/invitations'
import { itemsRoutes } from './routes/items'
import { jobsRoutes } from './routes/jobs'
import { meRoutes } from './routes/me'
import { modulesRoutes } from './routes/modules'
import { notesRoutes } from './routes/notes'
import { orgsRoutes } from './routes/orgs'
import { uploadsRoutes } from './routes/uploads'
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
      allowHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'X-Org-Id'],
      // SPA must be able to read Retry-After on 429 (credentials + expose).
      exposeHeaders: ['x-request-id', 'Retry-After'],
    }),
  )
  app.use('*', originGuard)
  app.use('*', withDb)
  app.use('*', withBetterAuth)
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
  app.route('/', adminUsersRoutes)
  app.route('/', adminAuditRoutes)
  app.route('/', meRoutes)
  app.route('/', modulesRoutes)
  app.route('/', orgsRoutes)
  app.route('/', invitationsRoutes)
  app.route('/', notesRoutes)
  app.route('/', itemsRoutes)
  app.route('/', uploadsRoutes)
  app.route('/', jobsRoutes)
  app.route('/', demoRoutes)

  return app
}
