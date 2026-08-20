/**
 * Cookie contract for kit SPA sessions (ADR-0002 — Better Auth only).
 * HttpOnly cookie + credentials: 'include' on the SPA.
 * Session token issuance/verification is owned by Better Auth handler + SessionPort.
 */

export type SessionPayload = {
  sub: string
  email: string
  exp: number
}

export const SESSION_COOKIE = 'kit_session'

export function sessionCookieHeader(
  token: string,
  opts?: { secure?: boolean; maxAge?: number },
): string {
  const secure = opts?.secure ? '; Secure' : ''
  const maxAge = opts?.maxAge ?? 60 * 60 * 24 * 7
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

/** Clear session cookie (logout). Same flags as set, Max-Age=0. */
export function clearSessionCookieHeader(opts?: { secure?: boolean }): string {
  const secure = opts?.secure ? '; Secure' : ''
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
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
  return parseCookie(header, name) ?? parseCookie(header, `__Secure-${name}`)
}
