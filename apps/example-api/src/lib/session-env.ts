import { type AuthSessionAdapter, sessionCookieName as cookieNameFromAuth } from '@gosilex/auth'
import { AppError } from '@gosilex/core'
import type { Env } from '../env'

const DEFAULT_CORS = 'http://localhost:5173,http://127.0.0.1:5173'
/** Local-only fallback — never accepted outside explicit development|test. */
const DEV_SESSION_FALLBACK = 'dev-session-secret-change-me-32chars!!'
const DEV_BA_FALLBACK = 'dev-better-auth-secret-change-me-32c!!'

/** Kit placeholders that must never ship as production secrets. */
const WEAK_SESSION_SECRETS = new Set([
  DEV_SESSION_FALLBACK,
  DEV_BA_FALLBACK,
  'dev-session-secret-change-me-32chars!!',
  'change-me-session-secret-min-32-chars!!',
  'dev-better-auth-secret-change-me-32c!!',
])

/** Explicit env only — missing ENVIRONMENT is not treated as development. */
export function environmentName(env: Env): string | undefined {
  const n = env.ENVIRONMENT?.trim().toLowerCase()
  return n || undefined
}

export function isDevLikeEnvironment(env: Env): boolean {
  const name = environmentName(env)
  return name === 'development' || name === 'test'
}

function isDevLike(env: Env): boolean {
  return isDevLikeEnvironment(env)
}

function assertStrongSecret(label: string, secret: string, env: Env): string {
  if (secret.length < 32) {
    throw AppError.internal(`${label} must be at least 32 characters`)
  }
  if (WEAK_SESSION_SECRETS.has(secret) && !isDevLike(env)) {
    throw AppError.internal(
      `${label} is a known kit placeholder; generate a unique secret for this environment`,
    )
  }
  return secret
}

/**
 * SESSION_SECRET:
 * - Prefer real secret (min 32) always when set.
 * - Reject known kit placeholders outside development|test.
 * - Known fallback only when ENVIRONMENT is **explicitly** `development` | `test` and secret unset.
 */
export function getSecret(env: Env): string {
  const secret = env.SESSION_SECRET?.trim()
  if (secret) {
    return assertStrongSecret('SESSION_SECRET', secret, env)
  }
  if (isDevLike(env)) {
    return DEV_SESSION_FALLBACK
  }
  throw AppError.internal(
    'SESSION_SECRET is required (min 32 chars) unless ENVIRONMENT is development|test',
  )
}

export function corsAllowlist(env: Env): string[] {
  return (env.CORS_ORIGINS || DEFAULT_CORS)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Secure cookies on HTTPS-like envs; local HTTP only for explicit development|test. */
export function useSecureCookie(env: Env): boolean {
  return !isDevLike(env)
}

/**
 * AUTH_SESSION_ADAPTER SSoT (spec D4).
 * Unset → `hmac` (back-compat for existing demos).
 */
export function authSessionAdapter(env: Env): AuthSessionAdapter {
  const raw = env.AUTH_SESSION_ADAPTER?.trim().toLowerCase()
  if (!raw || raw === 'hmac') return 'hmac'
  if (raw === 'better-auth') return 'better-auth'
  throw AppError.internal(
    `AUTH_SESSION_ADAPTER must be "hmac" or "better-auth" (got ${JSON.stringify(raw)})`,
  )
}

/** Session cookie name SSoT for dual-auth + originGuard. */
export function sessionCookieName(env: Env): string {
  return cookieNameFromAuth({ name: env.SESSION_COOKIE_NAME })
}

/**
 * Better Auth secret (min 32 + same weak denylist as SESSION_SECRET).
 * Required when adapter=better-auth (no silent reuse of SESSION_SECRET outside explicit unset+dev).
 */
export function getBetterAuthSecret(env: Env): string {
  const secret = env.BETTER_AUTH_SECRET?.trim()
  if (secret) {
    return assertStrongSecret('BETTER_AUTH_SECRET', secret, env)
  }
  if (isDevLike(env)) {
    // Dev-only fallback — never a production path
    return DEV_BA_FALLBACK
  }
  throw AppError.internal(
    'BETTER_AUTH_SECRET is required (min 32 chars) when AUTH_SESSION_ADAPTER=better-auth',
  )
}

/** Public BA sign-up allowed only when explicitly enabled (default off — security). */
export function allowPublicSignup(env: Env): boolean {
  return env.ALLOW_PUBLIC_SIGNUP?.trim().toLowerCase() === 'true'
}

export function assertBetterAuthConfigured(env: Env): void {
  if (authSessionAdapter(env) !== 'better-auth') return
  getBetterAuthSecret(env)
  if (!isDevLike(env) && !env.BETTER_AUTH_URL?.trim()) {
    throw AppError.internal(
      'BETTER_AUTH_URL is required when AUTH_SESSION_ADAPTER=better-auth outside development|test',
    )
  }
}
