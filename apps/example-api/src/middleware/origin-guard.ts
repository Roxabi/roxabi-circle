import { parseCookie } from '@kit/auth'
import { AppError } from '@kit/core'
import type { MiddlewareHandler } from 'hono'
import { corsAllowlist, sessionCookieNameFromEnv } from '../lib/session-env'
import type { AppEnv } from '../types'

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * CSRF defense-in-depth for cookie-authenticated mutations.
 * - If Origin is present → must be in CORS allowlist.
 * - If session cookie present and Origin missing → reject.
 * - Bearer / login without cookie may omit Origin (CLI, tests, MCP).
 * Cookie name from SSoT (sessionCookieNameFromEnv) — not hardcoded.
 */
export const originGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const method = c.req.method.toUpperCase()
  if (SAFE.has(method)) {
    await next()
    return
  }

  const origin = c.req.header('Origin')?.trim()
  const allow = corsAllowlist(c.env)

  if (origin) {
    if (!allow.includes(origin)) {
      throw AppError.forbidden('Origin not allowed')
    }
    await next()
    return
  }

  const cookie = c.req.header('Cookie')
  const name = sessionCookieNameFromEnv(c.env)
  // BA prefixes `__Secure-` when useSecureCookies is true (staging/prod).
  // parseCookie is exact-match — check both on-wire names.
  if (parseCookie(cookie, name) || parseCookie(cookie, `__Secure-${name}`)) {
    throw AppError.forbidden('Origin required for cookie-authenticated mutations')
  }

  await next()
}
