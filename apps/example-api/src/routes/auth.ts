import { parseOrThrow } from '@gosilex/core'
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

export const authRoutes = new Hono<AppEnv>()

/**
 * Mount exclusivity (spec D6):
 * - better-auth → ALL /api/auth/* via BA handler; no HMAC login routes
 * - hmac → POST login/logout HMAC only
 *
 * BA catch-all registered first when adapter is better-auth.
 */
authRoutes.all('/api/auth/*', async (c, next) => {
  if (authSessionAdapter(c.env) !== 'better-auth') {
    await next()
    return
  }
  const auth = c.get('betterAuth')
  if (!auth) {
    return c.json({ error: { code: 'INTERNAL', message: 'Better Auth not initialized' } }, 500)
  }
  return auth.handler(c.req.raw)
})

authRoutes.post('/api/auth/login', async (c) => {
  if (authSessionAdapter(c.env) === 'better-auth') {
    // Should have been handled by BA catch-all; fail closed if not
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Use Better Auth sign-in endpoints' } },
      404,
    )
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
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Use Better Auth sign-out endpoints' } },
      404,
    )
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
