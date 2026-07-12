import { AppError } from '@gosilex/core'
import { createDb } from '@gosilex/db'
import { Hono } from 'hono'
import { z } from 'zod'
import { schema } from '../db/schema'
import { assertRateLimit } from '../lib/rate-limit'
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
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'local'
  assertRateLimit(`login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS)

  const raw = await c.req.json().catch(() => null)
  const parsed = loginSchema.safeParse(raw)
  if (!parsed.success) {
    throw AppError.validation('Invalid login body', {
      fieldErrors: parsed.error.flatten().fieldErrors,
    })
  }
  const db = createDb(c.env.DB, schema)
  const { cookie, subject } = await authService.loginWithPassword(
    db,
    getSecret(c.env),
    parsed.data.email,
    parsed.data.password,
    {
      secureCookie: useSecureCookie(c.env),
      environment: environmentName(c.env),
    },
  )
  c.header('Set-Cookie', cookie)
  return c.json({ subject, email: parsed.data.email, requestId: c.get('requestId') })
})

authRoutes.post('/api/auth/logout', async (c) => {
  c.header('Set-Cookie', authService.logoutCookie({ secureCookie: useSecureCookie(c.env) }))
  return c.json({ ok: true, requestId: c.get('requestId') })
})
