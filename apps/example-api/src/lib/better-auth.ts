/**
 * Per-request Better Auth factory (CF Workers pattern).
 * Only used when AUTH_SESSION_ADAPTER=better-auth.
 */
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { drizzle } from 'drizzle-orm/d1'
import { betterAuthDrizzleSchema } from '../db/better-auth-schema'
import type { Env } from '../env'
import { getBetterAuthSecret, sessionCookieName, useSecureCookie } from './session-env'

export type KitBetterAuth = ReturnType<typeof createBetterAuth>

export function createBetterAuth(env: Env, baseURL: string) {
  const db = drizzle(env.DB, { schema: betterAuthDrizzleSchema })
  const cookieName = sessionCookieName(env)
  const secure = useSecureCookie(env)

  return betterAuth({
    baseURL,
    secret: getBetterAuthSecret(env),
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: betterAuthDrizzleSchema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    advanced: {
      useSecureCookies: secure,
      // Prefer kit cookie name for dual-auth / originGuard SSoT
      cookies: {
        session_token: {
          name: cookieName,
          attributes: {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            secure,
          },
        },
      },
    },
    trustedOrigins: (env.CORS_ORIGINS || 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  })
}

/** Resolve baseURL from request origin or BETTER_AUTH_URL env. */
export function betterAuthBaseURL(env: Env, requestUrl: string): string {
  const configured = env.BETTER_AUTH_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')
  try {
    return new URL(requestUrl).origin
  } catch {
    return 'http://localhost:8787'
  }
}
