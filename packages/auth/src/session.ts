/**
 * Cookie contract for kit SPA sessions (ADR-0002 — Better Auth only).
 * HttpOnly cookie + credentials: 'include' on the SPA.
 * Session token issuance/verification is owned by Better Auth handler + SessionPort.
 */

export type SessionPayload = {
  sub: string
  /** Verified Better Auth session record ID, never the cookie token. */
  sessionId: string
  email: string
  exp: number
}

export const SESSION_COOKIE = 'kit_session'

const SECURE_PREFIX = '__Secure-'

export type SessionCookieOpts = {
  /** Logical name (`SESSION_COOKIE_NAME`). Wire form adds `__Secure-` when Secure. */
  name?: string
  /** Default true. HTTP opt-out only. */
  secure?: boolean
  maxAge?: number
}

/** BA on-wire name: `__Secure-${logical}` when Secure, else the logical name. */
export function sessionCookieWireName(logicalName: string, secure: boolean): string {
  const name = logicalName.trim() || SESSION_COOKIE
  if (!secure) return name
  return name.startsWith(SECURE_PREFIX) ? name : `${SECURE_PREFIX}${name}`
}

export function sessionCookieHeader(token: string, opts?: SessionCookieOpts): string {
  const logical = opts?.name?.trim() || SESSION_COOKIE
  const secure = opts?.secure !== false
  const maxAge = opts?.maxAge ?? 60 * 60 * 24 * 7
  const name = sessionCookieWireName(logical, secure)
  const secureAttr = secure ? '; Secure' : ''
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureAttr}`
}

/** Clear session cookie (logout). Same flags as set, Max-Age=0. Default Secure. */
export function clearSessionCookieHeader(opts?: Omit<SessionCookieOpts, 'maxAge'>): string {
  return sessionCookieHeader('', { ...opts, maxAge: 0 })
}

export function parseCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return rest.join('=') || null
  }
  return null
}

/**
 * BA on-wire names: logical `name` (dev/test) or `__Secure-${name}` (staging/prod).
 * originGuard must use this — `sessionCookieNameFromEnv` is the logical name only.
 */
export function parseSessionCookie(header: string | null | undefined, name: string): string | null {
  return parseCookie(header, name) ?? parseCookie(header, `${SECURE_PREFIX}${name}`)
}
