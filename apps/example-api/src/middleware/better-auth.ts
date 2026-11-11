import type { MiddlewareHandler } from 'hono'
import { betterAuthBaseURL, createBetterAuth, type KitBetterAuth } from '../lib/better-auth'
import type { AppEnv } from '../types'

/**
 * Per-request Better Auth instance on context (ADR-0002 BA-only).
 */
export const withBetterAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const baseURL = betterAuthBaseURL(c.env, c.req.url)
  const auth = createBetterAuth(c.env, baseURL)
  c.set('betterAuth', auth as KitBetterAuth)
  await next()
}
