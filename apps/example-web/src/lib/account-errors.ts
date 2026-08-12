import type { Messages } from '../messages/fr'
import { ApiError, apiErrorToMessage } from './api'

/** ApiError fields + BA non-kit envelopes `Error('HTTP N')` from apiFetch. */
function resolveStatusCode(err: unknown): { status: number | null; code: string | null } {
  if (err instanceof ApiError) return { status: err.status, code: err.code }
  if (err instanceof Error) {
    const match = /^HTTP (\d{3})$/.exec(err.message)
    if (match) return { status: Number(match[1]), code: null }
  }
  return { status: null, code: null }
}

/** True for ApiError 429 / RATE_LIMITED or `Error('HTTP 429')`. */
export function isRateLimited(err: unknown): boolean {
  const { status, code } = resolveStatusCode(err)
  return status === 429 || code === 'RATE_LIMITED'
}

/**
 * Map BA / kit errors for **change-password** toasts only.
 * BA often returns non-kit envelopes → `Error('HTTP {status}')` from apiFetch.
 *
 * Status policy (MVP):
 * - 401 → re-auth
 * - 429 → rate limited
 * - 400 → wrong current password
 * - 403 → re-auth (future SESSION_NOT_FRESH / forbidden sensitive) — not “wrong password”
 */
export function changePasswordErrorMessage(err: unknown, m: Messages): string {
  const { status, code } = resolveStatusCode(err)
  if (status === 401 || code === 'UNAUTHORIZED') return m.changePasswordReauth
  if (status === 429 || code === 'RATE_LIMITED') return m.errRateLimited
  if (status === 403 || code === 'FORBIDDEN') return m.changePasswordReauth
  if (status === 400) return m.changePasswordWrong
  return apiErrorToMessage(err, m)
}

/**
 * Map errors for **profile / non-password** account surfaces.
 * Never uses change-password copy (wrong password / reauth-for-password).
 */
export function profileErrorMessage(err: unknown, m: Messages): string {
  const { status, code } = resolveStatusCode(err)
  if (status === 401 || code === 'UNAUTHORIZED') return m.errUnauthorized
  if (status === 429 || code === 'RATE_LIMITED') return m.errRateLimited
  if (status === 400 || code === 'VALIDATION_ERROR') return m.errValidation
  return apiErrorToMessage(err, m)
}

/**
 * Map errors for **password sign-in** only.
 *
 * **UI copy only** — 400 / 401 / 403 / UNAUTHORIZED / FORBIDDEN / VALIDATION_ERROR
 * collapse to the same `loginFailed` string so the toast does not differ for
 * unknown email vs wrong password. HTTP status (and BA body) may still differ
 * on the wire (Network tab). Full anti-enumeration requires BA/Worker response
 * normalization — not this helper.
 *
 * 429 stays rate-limited.
 */
export function loginErrorMessage(err: unknown, m: Messages): string {
  const { status, code } = resolveStatusCode(err)
  if (status === 429 || code === 'RATE_LIMITED') return m.errRateLimited
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    code === 'UNAUTHORIZED' ||
    code === 'FORBIDDEN' ||
    code === 'VALIDATION_ERROR'
  ) {
    return m.loginFailed
  }
  return apiErrorToMessage(err, m)
}
