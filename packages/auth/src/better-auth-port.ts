import type { SessionPayload } from './session'
import { clearSessionCookieHeader, SESSION_COOKIE, sessionCookieHeader } from './session'
import type { ResolveSessionInput, SessionPort } from './session-port'

/**
 * Minimal Better Auth surface used by the kit SessionPort adapter.
 * Apps pass a per-request `auth` instance (CF bindings pattern).
 *
 * Kept structural (no hard dependency on `better-auth` types) so
 * `@gosilex/auth` stays installable without the optional peer at typecheck
 * for consumers that only use HMAC.
 */
export type BetterAuthLike = {
  api: {
    getSession: (opts: { headers: Headers }) => Promise<{
      user: { id: string; email?: string | null }
      session: { expiresAt?: Date | string | null }
    } | null>
  }
}

export type CreateBetterAuthSessionPortOpts = {
  /**
   * Resolve the Better Auth instance for this request.
   * Must be per-request on Workers (bindings / D1).
   */
  getAuth: () => BetterAuthLike | Promise<BetterAuthLike>
  /** Cookie name for clear/set helpers (SSoT with dual-auth). */
  cookieName?: string
}

function headersFromInput(input: ResolveSessionInput): Headers {
  if (input.headers) return input.headers
  const h = new Headers()
  if (input.cookieHeader) h.set('cookie', input.cookieHeader)
  return h
}

function expFromSession(expiresAt: Date | string | null | undefined): number {
  if (expiresAt instanceof Date) return Math.floor(expiresAt.getTime() / 1000)
  if (typeof expiresAt === 'string') {
    const t = Date.parse(expiresAt)
    if (!Number.isNaN(t)) return Math.floor(t / 1000)
  }
  // Fallback: 7d from now if BA omits expiry on the wire shape we map
  return Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
}

/**
 * SessionPort adapter for Better Auth.
 * - `resolveSession` → `auth.api.getSession({ headers })`
 * - `sign` throws — session issuance is owned by BA HTTP handler
 * - `verify` is unused for dual-auth (prefer resolveSession)
 * - cookie helpers use the shared cookie name for clear-by-name logout fallback
 */
export function createBetterAuthSessionPort(opts: CreateBetterAuthSessionPortOpts): SessionPort {
  const cookieName = opts.cookieName ?? SESSION_COOKIE

  return {
    async sign() {
      throw new Error(
        'Better Auth SessionPort does not sign tokens — use BA handler /api/auth/* for session issuance',
      )
    },
    async verify() {
      return null
    },
    async resolveSession(input) {
      try {
        const auth = await opts.getAuth()
        const session = await auth.api.getSession({ headers: headersFromInput(input) })
        if (!session?.user?.id) return null
        const email = session.user.email ?? ''
        const payload: SessionPayload = {
          sub: session.user.id,
          email,
          exp: expFromSession(session.session?.expiresAt),
        }
        if (payload.exp < Math.floor(Date.now() / 1000)) return null
        return payload
      } catch {
        return null
      }
    },
    cookieHeader(token, headerOpts) {
      // BA usually sets Set-Cookie itself; helper kept for parity / tests.
      return sessionCookieHeader(token, headerOpts).replace(`${SESSION_COOKIE}=`, `${cookieName}=`)
    },
    clearCookieHeader(headerOpts) {
      return clearSessionCookieHeader(headerOpts).replace(`${SESSION_COOKIE}=`, `${cookieName}=`)
    },
  }
}
