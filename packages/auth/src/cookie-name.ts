import { SESSION_COOKIE } from './session'

export type SessionCookieNameOpts = {
  /** Override cookie name (env SESSION_COOKIE_NAME). */
  name?: string | null
}

/**
 * Cookie name SSoT for dual-auth + originGuard.
 * Default remains `gosilex_session` (SESSION_COOKIE) for FE/API contract stability.
 */
export function sessionCookieName(opts?: SessionCookieNameOpts): string {
  const n = opts?.name?.trim()
  return n && n.length > 0 ? n : SESSION_COOKIE
}
