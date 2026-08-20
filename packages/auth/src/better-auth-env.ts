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
 * SESSION_SECRET (optional residual helpers / legacy cookie utils):
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

function isWildcardOrNullOrigin(o: string): boolean {
  const n = o.trim().toLowerCase()
  return n === '*' || n === 'null'
}

function isLoopbackOrigin(o: string): boolean {
  try {
    const host = new URL(o).hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(o)
  }
}

/**
 * Fail-closed origin list for CORS and BA `trustedOrigins`.
 * Factory calls this so products cannot skip `corsAllowlist` and pass `*`.
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
  if (list.some(isWildcardOrNullOrigin)) {
    throw AppError.internal(`${label} must be explicit origins (never * or null)`)
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
