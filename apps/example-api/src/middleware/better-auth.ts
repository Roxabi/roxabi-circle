import type { MiddlewareHandler } from 'hono'
import { betterAuthBaseURL, createBetterAuth, type KitBetterAuth } from '../lib/better-auth'
import { authSessionAdapter } from '../lib/session-env'
import type { AppEnv } from '../types'

/**
 * Per-request Better Auth instance on context when adapter=better-auth.
 * No-op for hmac adapter (avoids pulling BA secret requirements on HMAC demos).
 */
export const withBetterAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (authSessionAdapter(c.env) === 'better-auth') {
    const baseURL = betterAuthBaseURL(c.env, c.req.url)
    const auth = createBetterAuth(c.env, baseURL)
    c.set('betterAuth', auth as KitBetterAuth)
  }
  await next()
}
