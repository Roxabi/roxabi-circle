import type { Messages } from '../messages/fr'
import { ApiError, apiErrorToMessage } from './api'

function httpStatus(err: unknown): number | null {
  if (err instanceof ApiError) return err.status
  if (err instanceof Error) {
    const match = /^HTTP (\d{3})$/.exec(err.message)
    if (match) return Number(match[1])
  }
  return null
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
  if (err instanceof ApiError) {
    if (err.status === 401 || err.code === 'UNAUTHORIZED') return m.changePasswordReauth
    if (err.status === 429 || err.code === 'RATE_LIMITED') return m.errRateLimited
    if (err.status === 403 || err.code === 'FORBIDDEN') return m.changePasswordReauth
    if (err.status === 400) return m.changePasswordWrong
    return apiErrorToMessage(err, m)
  }
  const status = httpStatus(err)
  if (status === 401) return m.changePasswordReauth
  if (status === 429) return m.errRateLimited
  if (status === 403) return m.changePasswordReauth
  if (status === 400) return m.changePasswordWrong
  return apiErrorToMessage(err, m)
}

/**
 * Map errors for **profile / non-password** account surfaces.
 * Never uses change-password copy (wrong password / reauth-for-password).
 */
export function profileErrorMessage(err: unknown, m: Messages): string {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.code === 'UNAUTHORIZED') return m.errUnauthorized
    if (err.status === 429 || err.code === 'RATE_LIMITED') return m.errRateLimited
    if (err.status === 400 || err.code === 'VALIDATION_ERROR') return m.errValidation
    return apiErrorToMessage(err, m)
  }
  const status = httpStatus(err)
  if (status === 401) return m.errUnauthorized
  if (status === 429) return m.errRateLimited
  if (status === 400) return m.errValidation
  return apiErrorToMessage(err, m)
}

/**
 * Map errors for **password sign-in** only.
 * 400 / 401 / 403 / UNAUTHORIZED / FORBIDDEN / VALIDATION → same non-enumerating
 * `loginFailed` (unknown email vs wrong password must not differ in UI copy).
 * 429 stays rate-limited.
 */
export function loginErrorMessage(err: unknown, m: Messages): string {
  if (err instanceof ApiError) {
    if (err.status === 429 || err.code === 'RATE_LIMITED') return m.errRateLimited
    if (
      err.status === 400 ||
      err.status === 401 ||
      err.status === 403 ||
      err.code === 'UNAUTHORIZED' ||
      err.code === 'FORBIDDEN' ||
      err.code === 'VALIDATION_ERROR'
    ) {
      return m.loginFailed
    }
    return apiErrorToMessage(err, m)
  }
  const status = httpStatus(err)
  if (status === 429) return m.errRateLimited
  if (status === 400 || status === 401 || status === 403) return m.loginFailed
  return apiErrorToMessage(err, m)
}
