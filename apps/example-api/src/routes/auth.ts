import { parseOrThrow } from '@gosilex/core'
import { Hono } from 'hono'
import { z } from 'zod'
import type { KitDb } from '../lib/db-type'
import { assertRateLimit, clientIp } from '../lib/rate-limit'
import { environmentName, getSecret, useSecureCookie } from '../lib/session-env'
import * as authService from '../services/auth'
import type { AppEnv } from '../types'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

/** 20 login attempts / IP / 15 min (demo in-memory). */
const LOGIN_LIMIT = 20
const LOGIN_WINDOW_MS = 15 * 60 * 1000

export const authRoutes = new Hono<AppEnv>()

authRoutes.post('/api/auth/login', async (c) => {
  assertRateLimit(`login:${clientIp(c.req)}`, LOGIN_LIMIT, LOGIN_WINDOW_MS)

  const raw = await c.req.json().catch(() => null)
  const body = parseOrThrow(loginSchema, raw, 'Invalid login body')
  const db = c.get('db') as KitDb
  const { cookie, subject } = await authService.loginWithPassword(
    db,
    getSecret(c.env),
    body.email,
    body.password,
    {
      secureCookie: useSecureCookie(c.env),
      environment: environmentName(c.env),
    },
  )
  c.header('Set-Cookie', cookie)
  return c.json({ subject, email: body.email, requestId: c.get('requestId') })
})

authRoutes.post('/api/auth/logout', async (c) => {
  c.header('Set-Cookie', authService.logoutCookie({ secureCookie: useSecureCookie(c.env) }))
  return c.json({ ok: true, requestId: c.get('requestId') })
})
