/**
 * Per-request Better Auth factory (CF Workers pattern, ADR-0002 + ADR-0008 D6).
 * Products import this — they do not copy `example-api/src/lib/better-auth.ts`.
 */
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink } from 'better-auth/plugins'
import { drizzle } from 'drizzle-orm/d1'
import {
  type AuthEmailPort,
  MAGIC_LINK_EXPIRES_IN_SEC,
  RESET_PASSWORD_TOKEN_EXPIRES_IN_SEC,
  sendMagicLinkMail,
  sendResetPasswordMail,
} from './auth-email'
import { assertAuthSecret, assertTrustedOrigins } from './better-auth-env'
import type { BetterAuthLike } from './better-auth-port'
import { betterAuthDrizzleSchema } from './better-auth-schema'
import { sessionCookieName } from './cookie-name'
import { createFirstSessionAfterHook, type FirstSessionHandler } from './first-session-hook'
import { createKitOrganizationPlugin } from './org-plugin'

/**
 * Hono context surface for BA instance (handler + session API).
 * Structural type — avoids TS2742 when plugins (magicLink) pull non-portable zod paths
 * into `ReturnType<typeof createBetterAuth>` under declaration emit.
 */
export type KitBetterAuth = BetterAuthLike & {
  handler: (request: Request) => Response | Promise<Response>
}

export type CreateBetterAuthOpts = {
  /** D1 binding (or test double). */
  database: unknown
  secret: string
  baseURL: string
  trustedOrigins: string[]
  /** Loopback origins allowed only for explicit development|test adapters. Default false. */
  allowLoopbackOrigins?: boolean
  emailPort: AuthEmailPort
  schema?: typeof betterAuthDrizzleSchema
  cookieName?: string
  useSecureCookies?: boolean
  allowPublicSignup?: boolean
  /** Product typically wires audit `tryFirstLogin`. Omit if audit module is not mounted. */
  onFirstSession?: FirstSessionHandler
  magicLinkExpiresIn?: number
  resetPasswordTokenExpiresIn?: number
  /** Only for explicit development|test placeholders — never production. */
  allowKitPlaceholderSecret?: boolean
}

export function createBetterAuth(opts: CreateBetterAuthOpts): KitBetterAuth {
  assertAuthSecret('BETTER_AUTH_SECRET', opts.secret, {
    allowKitPlaceholder: opts.allowKitPlaceholderSecret,
  })
  const trustedOrigins = assertTrustedOrigins(opts.trustedOrigins, {
    allowLoopback: opts.allowLoopbackOrigins === true,
  })
  const schema = opts.schema ?? betterAuthDrizzleSchema
  const db = drizzle(opts.database as never, { schema })
  const cookieName = sessionCookieName({ name: opts.cookieName })
  const secure = opts.useSecureCookies ?? true
  const publicSignup = opts.allowPublicSignup ?? false
  const emailPort = opts.emailPort

  return betterAuth({
    baseURL: opts.baseURL,
    basePath: '/api/auth',
    secret: opts.secret,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema,
    }),
    databaseHooks: {
      session: {
        create: {
          after: createFirstSessionAfterHook(opts.onFirstSession),
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: !publicSignup,
      resetPasswordTokenExpiresIn:
        opts.resetPasswordTokenExpiresIn ?? RESET_PASSWORD_TOKEN_EXPIRES_IN_SEC,
      sendResetPassword: async ({ user, url }) => {
        await sendResetPasswordMail(emailPort, { email: user.email, url })
      },
    },
    plugins: [
      createKitOrganizationPlugin(),
      magicLink({
        expiresIn: opts.magicLinkExpiresIn ?? MAGIC_LINK_EXPIRES_IN_SEC,
        disableSignUp: !publicSignup,
        sendMagicLink: async ({ email, url }) => {
          await sendMagicLinkMail(emailPort, { email, url })
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
    trustedOrigins,
  })
}
