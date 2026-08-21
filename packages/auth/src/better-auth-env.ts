import { AppError } from '@kit/core'
import { sessionCookieName } from './cookie-name'

const DEFAULT_CORS = 'http://localhost:5173,http://127.0.0.1:5173'
/** Local-only fallback — never accepted outside explicit development|test. */
const DEV_SESSION_FALLBACK = 'dev-session-secret-change-me-32chars!!'
const DEV_BA_FALLBACK = 'dev-better-auth-secret-change-me-32c!!'

/** Kit placeholders that must never ship as production secrets. */
const WEAK_SESSION_SECRETS = new Set([
  DEV_SESSION_FALLBACK,
  DEV_BA_FALLBACK,
  'change-me-session-secret-min-32-chars!!',
])

/**
 * String-env slice used by BA helpers. Apps pass Worker env; extra keys ignored.
 */
export type BetterAuthEnvSlice = {
  ENVIRONMENT?: string | null
  BETTER_AUTH_SECRET?: string | null
  BETTER_AUTH_URL?: string | null
  SESSION_SECRET?: string | null
  SESSION_COOKIE_NAME?: string | null
  CORS_ORIGINS?: string | null
  ALLOW_PUBLIC_SIGNUP?: string | null
}

/** Explicit env only — missing ENVIRONMENT is not treated as development. */
export function environmentName(env: BetterAuthEnvSlice): string | undefined {
  const n = env.ENVIRONMENT?.trim().toLowerCase()
  return n || undefined
}

export function isDevLikeEnvironment(env: BetterAuthEnvSlice): boolean {
  const name = environmentName(env)
  return name === 'development' || name === 'test'
}

/** Min 32 + kit-placeholder denylist. Factory calls this so products cannot skip env helpers. */
export function assertAuthSecret(
  label: string,
  secret: string,
  opts?: { allowKitPlaceholder?: boolean },
): string {
  if (secret.length < 32) {
    throw AppError.internal(`${label} must be at least 32 characters`)
  }
  if (WEAK_SESSION_SECRETS.has(secret) && !opts?.allowKitPlaceholder) {
    throw AppError.internal(
      `${label} is a known kit placeholder; generate a unique secret for this environment`,
    )
  }
  return secret
}

function assertStrongSecret(label: string, secret: string, env: BetterAuthEnvSlice): string {
  return assertAuthSecret(label, secret, { allowKitPlaceholder: isDevLikeEnvironment(env) })
}

/**
 * HMAC leftover — **not** on the Better Auth session path (use getBetterAuthSecret).
 * Kept so existing product env inventories / tests do not break mid-inherit.
 * - Prefer real secret (min 32) always when set.
 * - Reject known kit placeholders outside development|test.
 * - Known fallback only when ENVIRONMENT is **explicitly** `development` | `test` and secret unset.
 */
export function getSessionSecret(env: BetterAuthEnvSlice): string {
  const secret = env.SESSION_SECRET?.trim()
  if (secret) {
    return assertStrongSecret('SESSION_SECRET', secret, env)
  }
  if (isDevLikeEnvironment(env)) {
    return DEV_SESSION_FALLBACK
  }
  throw AppError.internal(
    'SESSION_SECRET is required (min 32 chars) unless ENVIRONMENT is development|test',
  )
}

function isGlobOrNullOrigin(o: string): boolean {
  const n = o.trim().toLowerCase()
  return n === '*' || n === 'null' || n.includes('*') || n.includes('?')
}

function isHttpOrigin(o: string): boolean {
  try {
    const u = new URL(o)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    if (u.origin === o) return true
    // URL parser drops trailing FQDN dots on IPv4 hosts (`http://127.0.0.1.`).
    return u.origin === o.replace(/\.+(?=:\d+$|$)/, '')
  } catch {
    return false
  }
}

function stripHostDecorations(hostname: string): string {
  let h = hostname.toLowerCase()
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1)
  const zone = h.indexOf('%')
  if (zone !== -1) h = h.slice(0, zone)
  while (h.endsWith('.')) h = h.slice(0, -1)
  return h
}

function isIpv4Loopback(host: string): boolean {
  const parts = host.split('.')
  if (parts.length !== 4) return false
  const octets: number[] = []
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return false
    const n = Number(p)
    if (n > 255) return false
    octets.push(n)
  }
  return octets[0] === 127
}

/** IPv4-mapped IPv6 carrying a dotted or hex 32-bit suffix (`::ffff:7f00:2`). */
function ipv4FromMapped6(host: string): string | undefined {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host)
  if (dotted) return dotted[1]
  const hex = /^(?:(?:0:){0,5}|::)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host)
  if (!hex) return undefined
  const hi = Number.parseInt(hex[1], 16)
  const lo = Number.parseInt(hex[2], 16)
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`
}

/**
 * Loopback classifier (not a hostname denylist): IPv4 127/8, IPv6 ::1,
 * IPv4-mapped IPv6 127/8, DNS `localhost` / RFC 6761 `.localhost`,
 * trailing-dot FQDN forms, and unspecified `0.0.0.0` / `::`.
 */
function isLoopbackHost(hostname: string): boolean {
  const host = stripHostDecorations(hostname)
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true
  if (host === '0.0.0.0' || host === '::' || host === '0:0:0:0:0:0:0:0') return true
  const mapped = ipv4FromMapped6(host)
  if (mapped) return isIpv4Loopback(mapped)
  return isIpv4Loopback(host)
}

function isLoopbackOrigin(o: string): boolean {
  try {
    return isLoopbackHost(new URL(o).hostname)
  } catch {
    return false
  }
}

/**
 * Fail-closed origin list for CORS and BA `trustedOrigins`.
 * Factory calls this so products cannot skip `corsAllowlist` and pass `*`
 * or Better Auth globs (`https://*`, `*.example.com`).
 */
export function assertTrustedOrigins(
  origins: readonly string[],
  opts?: { allowLoopback?: boolean; label?: string },
): string[] {
  const label = opts?.label ?? 'trustedOrigins'
  const list = origins.map((s) => s.trim()).filter(Boolean)
  if (list.length === 0) {
    throw AppError.internal(`${label} must be explicit origins (never empty)`)
  }
  if (list.some(isGlobOrNullOrigin)) {
    const nullish = list.some((o) => o.trim().toLowerCase() === 'null')
    throw AppError.internal(
      nullish
        ? `${label} must never include a null origin`
        : `${label} must be explicit origins (never * or glob)`,
    )
  }
  if (!list.every(isHttpOrigin)) {
    throw AppError.internal(`${label} must be explicit http(s) origins (no path)`)
  }
  if (!opts?.allowLoopback && list.some(isLoopbackOrigin)) {
    throw AppError.internal(`${label} must not include loopback origins outside development|test`)
  }
  return list
}

export function corsAllowlist(env: BetterAuthEnvSlice): string[] {
  const raw = env.CORS_ORIGINS?.trim()
  const source = raw || (isDevLikeEnvironment(env) ? DEFAULT_CORS : '')
  if (!source) {
    throw AppError.internal('CORS_ORIGINS is required outside development|test')
  }
  return assertTrustedOrigins(source.split(','), {
    allowLoopback: isDevLikeEnvironment(env),
    label: 'CORS_ORIGINS',
  })
}

/** Secure cookies on HTTPS-like envs; local HTTP only for explicit development|test. */
export function useSecureCookie(env: BetterAuthEnvSlice): boolean {
  return !isDevLikeEnvironment(env)
}

/** Session cookie name SSoT for dual-auth + originGuard. */
export function sessionCookieNameFromEnv(env: BetterAuthEnvSlice): string {
  return sessionCookieName({ name: env.SESSION_COOKIE_NAME })
}

/**
 * Better Auth secret (min 32 + same weak denylist as SESSION_SECRET).
 * Required for all session auth (ADR-0002 BA-only).
 */
export function getBetterAuthSecret(env: BetterAuthEnvSlice): string {
  const secret = env.BETTER_AUTH_SECRET?.trim()
  if (secret) {
    return assertStrongSecret('BETTER_AUTH_SECRET', secret, env)
  }
  if (isDevLikeEnvironment(env)) {
    return DEV_BA_FALLBACK
  }
  throw AppError.internal('BETTER_AUTH_SECRET is required (min 32 chars) outside development|test')
}

/** Public BA sign-up allowed only when explicitly enabled (default off — security). */
export function allowPublicSignup(env: BetterAuthEnvSlice): boolean {
  return env.ALLOW_PUBLIC_SIGNUP?.trim().toLowerCase() === 'true'
}

/** Fail-closed BA config for non-dev (secret + URL). */
export function assertBetterAuthConfigured(env: BetterAuthEnvSlice): void {
  getBetterAuthSecret(env)
  if (!isDevLikeEnvironment(env) && !env.BETTER_AUTH_URL?.trim()) {
    throw AppError.internal('BETTER_AUTH_URL is required for Better Auth outside development|test')
  }
}

/** Resolve baseURL from BETTER_AUTH_URL (required outside local) or request origin (dev only). */
export function betterAuthBaseURL(env: BetterAuthEnvSlice, requestUrl: string): string {
  const configured = env.BETTER_AUTH_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')
  if (isDevLikeEnvironment(env)) {
    try {
      return new URL(requestUrl).origin
    } catch {
      return 'http://localhost:8787'
    }
  }
  throw AppError.internal('BETTER_AUTH_URL is required outside development|test')
}
