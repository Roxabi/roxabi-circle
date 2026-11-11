/**
 * Token-link href policy for email templates (M-09).
 * HTML-escape is not enough: javascript:/data:/off-origin https must not render.
 */
import { isLoopbackHost } from './loopback-host'

export type TokenHrefPolicy = {
  /** Exact origins (`scheme://host[:port]`). Required — unmigrated callers fail at tsc. */
  allowedOrigins: readonly string[]
  /**
   * Allow `http(s)://` loopback hosts without listing them.
   * Default false (fail closed). Dev BA factory passes true with `allowLoopbackOrigins`.
   */
  allowLoopbackHttp?: boolean
}

function originOf(raw: string): string | null {
  try {
    const u = new URL(raw)
    if (u.username || u.password) return null
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.origin
  } catch {
    return null
  }
}

function assertNoControlChars(raw: string): void {
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i)
    if (c <= 0x1f || c === 0x7f) throw new Error('EMAIL_TOKEN_HREF_INVALID')
  }
}

function parseHttpUrl(raw: string): URL {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('EMAIL_TOKEN_HREF_INVALID')
  }
  if (parsed.username || parsed.password) {
    throw new Error('EMAIL_TOKEN_HREF_INVALID')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('EMAIL_TOKEN_HREF_INVALID')
  }
  return parsed
}

function allowedOriginSet(allowedOrigins: readonly string[]): Set<string> {
  const allowed = new Set<string>()
  for (const o of allowedOrigins) {
    const origin = originOf(o)
    if (origin) allowed.add(origin)
  }
  return allowed
}

/** Validate a token URL; returns the original string on success. */
export function assertSafeTokenHref(raw: string, policy: TokenHrefPolicy): string {
  if (raw.length === 0) throw new Error('EMAIL_TOKEN_HREF_INVALID')
  if (!policy.allowedOrigins) throw new Error('EMAIL_TOKEN_HREF_INVALID')
  assertNoControlChars(raw)
  const parsed = parseHttpUrl(raw)
  const allowLoopback = policy.allowLoopbackHttp === true
  const loopback = isLoopbackHost(parsed.hostname)
  if (loopback && allowLoopback) return raw
  // Non-loopback token links must be https. Listed loopback http may pass the allowlist.
  if (parsed.protocol !== 'https:' && !loopback) {
    throw new Error('EMAIL_TOKEN_HREF_INVALID')
  }
  if (!allowedOriginSet(policy.allowedOrigins).has(parsed.origin)) {
    throw new Error('EMAIL_TOKEN_HREF_INVALID')
  }
  return raw
}
