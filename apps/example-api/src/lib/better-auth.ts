/**
 * example-api Env adapter for `@kit/auth` createBetterAuth (ADR-0008 D6).
 * Product apps should call `createBetterAuth` from `@kit/auth` directly.
 */
import {
  allowPublicSignup,
  assertBetterAuthConfigured,
  corsAllowlist,
  createBetterAuth as createKitBetterAuth,
  getBetterAuthSecret,
  type KitBetterAuth,
  sessionCookieNameFromEnv,
  useSecureCookie,
} from '@kit/auth'
import { betterAuthDrizzleSchema } from '@kit/auth/schema'
import type { Env } from '../env'
import { resolveEmailPort } from './email-port'

export { betterAuthBaseURL } from '@kit/auth'
export type { KitBetterAuth }

export function createBetterAuth(env: Env, baseURL: string): KitBetterAuth {
  assertBetterAuthConfigured(env)
  return createKitBetterAuth({
    database: env.DB,
    schema: betterAuthDrizzleSchema,
    secret: getBetterAuthSecret(env),
    baseURL,
    cookieName: sessionCookieNameFromEnv(env),
    useSecureCookies: useSecureCookie(env),
    allowPublicSignup: allowPublicSignup(env),
    trustedOrigins: corsAllowlist(env),
    // Resolve on send — constructing BA every request must not require EMAIL_TRANSPORT.
    emailPort: {
      send: async (input) => resolveEmailPort(env).send(input),
    },
    onFirstSession: async ({ userId }) => {
      const { createDb } = await import('@kit/db')
      const { schema: kitSchema } = await import('../db/schema')
      const { tryFirstLogin } = await import('../services/audit')
      const kitDb = createDb(env.DB, kitSchema)
      await tryFirstLogin(kitDb, {
        userId,
        actorUserId: userId,
        method: 'session',
      })
    },
  })
}
