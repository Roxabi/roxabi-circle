import { AppError, parseOrThrow } from '@gosilex/core'
import { Hono } from 'hono'
import { z } from 'zod'
import { assertRateLimit, clientIp } from '../lib/rate-limit'
import { authSessionAdapter, environmentName, getSecret, useSecureCookie } from '../lib/session-env'
import * as authService from '../services/auth'
import type { AppEnv } from '../types'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

/** 20 login attempts / IP / 15 min (demo in-memory). */
const LOGIN_LIMIT = 20
const LOGIN_WINDOW_MS = 15 * 60 * 1000

const BA_SENSITIVE =
  /\/api\/auth\/(sign-in|sign-up|sign-out|forget-password|reset-password|change-password)/i

export const authRoutes = new Hono<AppEnv>()

/**
 * Mount exclusivity (spec D6):
 * - better-auth → ALL /api/auth/* via BA handler; HMAC login returns notFound
 * - hmac → POST login/logout HMAC only
 */
authRoutes.all('/api/auth/*', async (c, next) => {
  if (authSessionAdapter(c.env) !== 'better-auth') {
    await next()
    return
  }
  const auth = c.get('betterAuth')
  if (!auth) {
    throw AppError.internal('Better Auth not initialized')
  }
  // Rate-limit sensitive BA auth endpoints (parity with HMAC login)
  if (BA_SENSITIVE.test(c.req.path)) {
    assertRateLimit(`ba-auth:${clientIp(c.req)}`, LOGIN_LIMIT, LOGIN_WINDOW_MS)
  }
  return auth.handler(c.req.raw)
})

authRoutes.post('/api/auth/login', async (c) => {
  if (authSessionAdapter(c.env) === 'better-auth') {
    throw AppError.notFound('Use Better Auth sign-in endpoints')
  }

  assertRateLimit(`login:${clientIp(c.req)}`, LOGIN_LIMIT, LOGIN_WINDOW_MS)

  const raw = await c.req.json().catch(() => null)
  const body = parseOrThrow(loginSchema, raw, 'Invalid login body')
  const db = c.get('db')!
  const { cookie, subject } = await authService.loginWithPassword(
    db,
    getSecret(c.env),
    body.email,
    body.password,
    {
      secureCookie: useSecureCookie(c.env),
      environment: environmentName(c.env),
      cookieName: authService.cookieNameFromEnv(c.env),
    },
  )
  c.header('Set-Cookie', cookie)
  return c.json({ subject, email: body.email, requestId: c.get('requestId') })
})

authRoutes.post('/api/auth/logout', async (c) => {
  if (authSessionAdapter(c.env) === 'better-auth') {
    throw AppError.notFound('Use Better Auth sign-out endpoints')
  }
  c.header(
    'Set-Cookie',
    authService.logoutCookie({
      secureCookie: useSecureCookie(c.env),
      cookieName: authService.cookieNameFromEnv(c.env),
    }),
  )
  return c.json({ ok: true, requestId: c.get('requestId') })
})
