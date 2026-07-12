import type { SessionPayload } from './session'
import {
  clearSessionCookieHeader,
  sessionCookieHeader,
  signSession,
  verifySession,
} from './session'

/**
 * Injectable session boundary (ADR-0002).
 *
 * Kit default = HMAC adapter. Product swap (Better Auth M3) implements the same
 * port without changing FE contract: HttpOnly cookie + credentials include.
 */
export type SessionPort = {
  sign(payload: SessionPayload, secret: string): Promise<string>
  verify(token: string, secret: string): Promise<SessionPayload | null>
  cookieHeader(token: string, opts?: { secure?: boolean; maxAge?: number }): string
  clearCookieHeader(opts?: { secure?: boolean }): string
}

/** Default kit adapter — HMAC-signed payload (Workers Web Crypto). */
export function createHmacSessionPort(): SessionPort {
  return {
    sign: signSession,
    verify: verifySession,
    cookieHeader: sessionCookieHeader,
    clearCookieHeader: clearSessionCookieHeader,
  }
}

/** Singleton default port for apps that do not inject their own adapter. */
export const defaultSessionPort: SessionPort = createHmacSessionPort()
