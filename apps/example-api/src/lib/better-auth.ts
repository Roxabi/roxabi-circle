/**
 * Per-request Better Auth factory (CF Workers pattern).
 * Session stack is BA-only (ADR-0002).
 * Organization plugin = tenant spine (ADR-0003).
 */
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAccessControl } from 'better-auth/plugins/access'
import { organization } from 'better-auth/plugins/organization'
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from 'better-auth/plugins/organization/access'
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

/** BA access controller + reader role (ADR-0003 four system roles). */
const ac = createAccessControl(defaultStatements)
const readerAc = ac.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: ['read'],
})

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
    plugins: [
      organization({
        ac,
        roles: {
          owner: ownerAc,
          admin: adminAc,
          member: memberAc,
          reader: readerAc,
        },
        // Phase A: kit owns create/memberships (seed + POST /api/orgs); BA plugin = schema + AC only.
        allowUserToCreateOrganization: false,
        disableOrganizationDeletion: true,
        invitationLimit: 0,
        schema: {
          organization: {
            additionalFields: {
              kind: {
                type: 'string',
                required: true,
                defaultValue: 'client',
                // Server-only — not client-writable (review fix)
                input: false,
              },
              status: {
                type: 'string',
                required: true,
                defaultValue: 'active',
                input: false,
              },
            },
          },
        },
      }),
    ],
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
