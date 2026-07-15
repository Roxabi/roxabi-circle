import { Hono } from 'hono'
import { environmentName, isDevLikeEnvironment } from '../lib/session-env'
import { SEED_USERS } from '../seed/demo-data'
import type { AppEnv } from '../types'

const ADMIN_SEED = SEED_USERS.find((u) => u.role === 'admin') ?? SEED_USERS[0]!

export const healthRoutes = new Hono<AppEnv>()

healthRoutes.get('/health', (c) => {
  const environment = environmentName(c.env) ?? 'unknown'
  const body: {
    ok: true
    service: string
    requestId: string
    environment: string
    demoLogin?: { email: string; password: string; role: string }
  } = {
    ok: true,
    service: 'example-api',
    requestId: c.get('requestId'),
    environment,
  }

  // Kit local DX only — public /health; never returned in staging/production.
  if (isDevLikeEnvironment(c.env)) {
    body.demoLogin = {
      email: ADMIN_SEED.email,
      password: ADMIN_SEED.password,
      role: ADMIN_SEED.role,
    }
  }

  return c.json(body)
})
