/**
 * Per-request Better Auth factory (CF Workers pattern).
 * Session stack is BA-only (ADR-0002).
 * Organization plugin = tenant spine (ADR-0003).
 */
import { buildMagicLinkEmailText, buildResetPasswordEmailText } from '@kit/email'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink } from 'better-auth/plugins'
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
import { resolveEmailPort } from './email-port'
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

/**
 * Hono context surface for BA instance (handler + session API).
 * Structural type — avoids TS2742 when plugins (magicLink) pull non-portable zod paths
 * into `ReturnType<typeof createBetterAuth>` under declaration emit.
 * Aligns with `@kit/auth` BetterAuthLike for SessionPort.
 */
export type KitBetterAuth = {
  handler: (request: Request) => Response | Promise<Response>
  api: {
    getSession: (opts: { headers: Headers }) => Promise<{
      user: { id: string; email?: string | null }
      session: { expiresAt?: Date | string | null }
    } | null>
  }
}

export function createBetterAuth(env: Env, baseURL: string): KitBetterAuth {
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
    // B-auth-harden #61 — first successful session → audit first_login (idempotent).
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            try {
              const { createDb } = await import('@kit/db')
              const { schema: kitSchema } = await import('../db/schema')
              const { tryFirstLogin } = await import('../services/audit')
              const userId = session.userId
              if (!userId) return
              const kitDb = createDb(env.DB, kitSchema)
              // method is generic "session" — BA hook has no request IP/path context
              await tryFirstLogin(kitDb, {
                userId,
                actorUserId: userId,
                method: 'session',
              })
            } catch (err) {
              // best-effort — never block session mint; still surface for ops
              console.error(
                JSON.stringify({
                  level: 'error',
                  msg: 'audit_append_failed',
                  action: 'first_login',
                  requestId: 'session_hook',
                  error: err instanceof Error ? err.message : String(err),
                }),
              )
            }
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      // Default: no open registration (HMAC seed-only parity). Opt-in via ALLOW_PUBLIC_SIGNUP=true.
      disableSignUp: !publicSignup,
      resetPasswordTokenExpiresIn: 3600,
      sendResetPassword: async ({ user, url }) => {
        const tmpl = buildResetPasswordEmailText({
          to: user.email,
          resetUrl: url,
          expiresHint: 'about 1 hour',
        })
        const port = resolveEmailPort(env)
        await port.send({
          to: tmpl.to,
          subject: tmpl.subject,
          text: tmpl.text,
          html: tmpl.html,
        })
      },
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
      // Passwordless sign-in (B-magic #59). Same public-signup flag as emailAndPassword.
      magicLink({
        expiresIn: 300,
        disableSignUp: !publicSignup,
        sendMagicLink: async ({ email, url }) => {
          const tmpl = buildMagicLinkEmailText({
            to: email,
            magicUrl: url,
            expiresHint: 'about 5 minutes',
          })
          const port = resolveEmailPort(env)
          await port.send({
            to: tmpl.to,
            subject: tmpl.subject,
            text: tmpl.text,
            html: tmpl.html,
          })
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
