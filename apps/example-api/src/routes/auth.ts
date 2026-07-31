import { AppError } from '@gosilex/core'
import { Hono } from 'hono'
import { assertRateLimit, clientIp } from '../lib/rate-limit'
import type { AppEnv } from '../types'

/** 20 auth attempts / IP / 15 min (demo in-memory). */
const LOGIN_LIMIT = 20
const LOGIN_WINDOW_MS = 15 * 60 * 1000

const BA_SENSITIVE =
  /\/api\/auth\/(sign-in|sign-up|sign-out|forget-password|reset-password|change-password)/i

/**
 * Phase A (ADR-0003 D10): block BA organization mutation / invite surface.
 * Allow session, credential, and read-only / set-active org paths only.
 */
const BA_ORG_MUTATION_DENY =
  /\/api\/auth\/organization\/(create|update|delete|invite-member|accept-invitation|reject-invitation|cancel-invitation|remove-member|update-member-role|leave|set-member-role)/i

export const authRoutes = new Hono<AppEnv>()

/**
 * Better Auth only (ADR-0002): ALL /api/auth/* via BA handler.
 * HMAC login/logout removed.
 */
authRoutes.all('/api/auth/*', async (c) => {
  const auth = c.get('betterAuth')
  if (!auth) {
    throw AppError.internal('Better Auth not initialized')
  }
  if (BA_ORG_MUTATION_DENY.test(c.req.path)) {
    throw AppError.notFound('Organization mutations use kit APIs or seed (Phase A)')
  }
  if (BA_SENSITIVE.test(c.req.path)) {
    assertRateLimit(`ba-auth:${clientIp(c.req)}`, LOGIN_LIMIT, LOGIN_WINDOW_MS)
  }
  return auth.handler(c.req.raw)
})
