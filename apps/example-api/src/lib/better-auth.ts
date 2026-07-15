/**
 * Per-request Better Auth factory (CF Workers pattern).
 * Only used when AUTH_SESSION_ADAPTER=better-auth.
 */
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { drizzle } from 'drizzle-orm/d1'
import { betterAuthDrizzleSchema } from '../db/better-auth-schema'
import type { Env } from '../env'
import {
  allowPublicSignup,
  assertBetterAuthConfigured,
  corsAllowlist,
  getBetterAuthSecret,
  isDevLikeEnvironment,
  sessionCookieName,
  useSecureCookie,
} from './session-env'

export type KitBetterAuth = ReturnType<typeof createBetterAuth>

export function createBetterAuth(env: Env, baseURL: string) {
  assertBetterAuthConfigured(env)
  const db = drizzle(env.DB, { schema: betterAuthDrizzleSchema })
  const cookieName = sessionCookieName(env)
  const secure = useSecureCookie(env)
  const publicSignup = allowPublicSignup(env)

  return betterAuth({
    baseURL,
    basePath: '/api/auth',
    secret: getBetterAuthSecret(env),
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: betterAuthDrizzleSchema,
    }),
    emailAndPassword: {
      enabled: true,
      // Default: no open registration (HMAC seed-only parity). Opt-in via ALLOW_PUBLIC_SIGNUP=true.
      disableSignUp: !publicSignup,
    },
    advanced: {
      useSecureCookies: secure,
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
    trustedOrigins: corsAllowlist(env),
  })
}

/** Resolve baseURL from BETTER_AUTH_URL (required outside local) or request origin (dev only). */
export function betterAuthBaseURL(env: Env, requestUrl: string): string {
  const configured = env.BETTER_AUTH_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')
  if (isDevLikeEnvironment(env)) {
    try {
      return new URL(requestUrl).origin
    } catch {
      return 'http://localhost:8787'
    }
  }
  // assertBetterAuthConfigured already requires URL outside dev; keep fail-closed
  throw new Error('BETTER_AUTH_URL is required outside development|test')
}
