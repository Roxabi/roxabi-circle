import { Hono } from 'hono'
import { allowPublicSignup, environmentName, isDevLikeEnvironment } from '../lib/session-env'
import { TENANCY_PASSWORD, TENANCY_PERSONAS } from '../seed/tenancy-data'
import type { AppEnv } from '../types'

/** Primary dogfood login for local BA (staff multi-org). */
const DEMO_STAFF =
  TENANCY_PERSONAS.find((p) => p.email.startsWith('staff@')) ?? TENANCY_PERSONAS[1]!

export const healthRoutes = new Hono<AppEnv>()

healthRoutes.get('/health', (c) => {
  const environment = environmentName(c.env) ?? 'unknown'
  const body: {
    ok: true
    service: string
    requestId: string
    environment: string
    /** Session stack — always Better Auth (ADR-0002). */
    authAdapter: 'better-auth'
    /**
     * Public BA email sign-up (SPA `/sign-up`). Fail-closed unless
     * `ALLOW_PUBLIC_SIGNUP=true` — products opt in via env, not a kit default.
     */
    allowPublicSignup: boolean
    demoLogin?: { email: string; password: string; role: string }
  } = {
    ok: true,
    service: 'example-api',
    requestId: c.get('requestId'),
    environment,
    authAdapter: 'better-auth',
    allowPublicSignup: allowPublicSignup(c.env),
  }

  // Kit local DX only — public /health; never returned in staging/production.
  if (isDevLikeEnvironment(c.env)) {
    body.demoLogin = {
      email: DEMO_STAFF.email,
      password: DEMO_STAFF.password || TENANCY_PASSWORD,
      role: DEMO_STAFF.platformRole ?? 'staff',
    }
  }

  return c.json(body)
})
