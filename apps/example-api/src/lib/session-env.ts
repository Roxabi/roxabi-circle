import { AppError } from '@gosilex/core'
import type { Env } from '../env'

const DEFAULT_CORS = 'http://localhost:5173,http://127.0.0.1:5173'
const DEV_SESSION_FALLBACK = 'dev-session-secret-change-me-32chars!!'

/** Explicit env only — missing ENVIRONMENT is not treated as development. */
export function environmentName(env: Env): string | undefined {
  const n = env.ENVIRONMENT?.trim().toLowerCase()
  return n || undefined
}

/**
 * SESSION_SECRET:
 * - Prefer real secret (min 32) always when set.
 * - Known fallback only when ENVIRONMENT is **explicitly** `development` | `test`.
 * - Missing ENVIRONMENT or production/staging → fail closed without secret.
 */
export function getSecret(env: Env): string {
  const secret = env.SESSION_SECRET?.trim()
  if (secret && secret.length >= 32) return secret
  const name = environmentName(env)
  if (name === 'development' || name === 'test') {
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
  const name = environmentName(env)
  return name !== 'development' && name !== 'test'
}
