import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { corsAllowlist } from './lib/session-env'
import { onError } from './middleware/error-handler'
import { requestIdMiddleware } from './middleware/request-id'
import { securityHeaders } from './middleware/security-headers'
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
      exposeHeaders: ['x-request-id'],
    }),
  )
  app.onError((err, c) => onError(err, c))

  // routes → services → repos (secondary axis)
  app.route('/', healthRoutes)
  app.route('/', authRoutes)
  app.route('/', meRoutes)
  app.route('/', notesRoutes)
  app.route('/', demoRoutes)

  return app
}
