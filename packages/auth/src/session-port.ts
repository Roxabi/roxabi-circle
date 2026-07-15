import type { SessionPayload } from './session'
import {
  clearSessionCookieHeader,
  parseCookie,
  SESSION_COOKIE,
  sessionCookieHeader,
  signSession,
  verifySession,
} from './session'

/**
 * Injectable session boundary (ADR-0002 / Better Auth M3).
 *
 * Kit default = HMAC adapter. Better Auth implements the same port:
 * HttpOnly cookie + credentials include on the SPA.
 *
 * Prefer `resolveSession` for dual-auth (cookie name + headers).
 * `sign` / `verify` remain for HMAC and tests; BA adapters may no-op `sign`
 * when the BA handler owns Set-Cookie.
 */
export type ResolveSessionInput = {
  cookieHeader?: string | null
  /** Full request headers when available (Better Auth getSession). */
  headers?: Headers
  secret?: string
  cookieName: string
}

export type SessionPort = {
  sign(payload: SessionPayload, secret: string): Promise<string>
  verify(token: string, secret: string): Promise<SessionPayload | null>
  /**
   * Preferred session resolve for dual-auth.
   * HMAC: parse cookieName + verify. BA: getSession({ headers }).
   */
  resolveSession(input: ResolveSessionInput): Promise<SessionPayload | null>
  cookieHeader(token: string, opts?: { secure?: boolean; maxAge?: number }): string
  clearCookieHeader(opts?: { secure?: boolean }): string
}

/** Default kit adapter — HMAC-signed payload (Workers Web Crypto). */
export function createHmacSessionPort(): SessionPort {
  return {
    sign: signSession,
    verify: verifySession,
    async resolveSession(input) {
      const name = input.cookieName || SESSION_COOKIE
      const token = parseCookie(input.cookieHeader, name)
      if (!token || !input.secret) return null
      return verifySession(token, input.secret)
    },
    cookieHeader: sessionCookieHeader,
    clearCookieHeader: clearSessionCookieHeader,
  }
}

/** Singleton default port for apps that do not inject their own adapter. */
export const defaultSessionPort: SessionPort = createHmacSessionPort()
