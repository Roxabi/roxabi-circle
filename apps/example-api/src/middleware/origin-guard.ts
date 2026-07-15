import { parseCookie } from '@gosilex/auth'
import { AppError } from '@gosilex/core'
import type { MiddlewareHandler } from 'hono'
import { corsAllowlist, sessionCookieName } from '../lib/session-env'
import type { AppEnv } from '../types'

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * CSRF defense-in-depth for cookie-authenticated mutations.
 * - If Origin is present → must be in CORS allowlist.
 * - If session cookie present and Origin missing → reject.
 * - Bearer / login without cookie may omit Origin (CLI, tests, MCP).
 * Cookie name from SSoT (sessionCookieName) — not hardcoded.
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
  const name = sessionCookieName(c.env)
  if (parseCookie(cookie, name)) {
    throw AppError.forbidden('Origin required for cookie-authenticated mutations')
  }

  await next()
}
