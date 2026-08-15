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

/** Status ≥ 500 (`ApiError` or `Error('HTTP N')`); status-less failures fail-closed. */
export function isServerError(err: unknown): boolean {
  const { status } = resolveStatusCode(err)
  if (status != null && status >= 500) return true
  if (status == null && err != null) return true
  return false
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
  if (isServerError(err)) return m.errInternal
  return apiErrorToMessage(err, m)
}

/**
 * Map errors for **password sign-in** only.
 *
 * Wire: example-api normalizes failed POST `/api/auth/sign-in/email` to
 * **401 + UNAUTHORIZED** kit envelope (anti-enumeration) — see
 * `sign-in-anti-enum.ts`. 429 remains rate-limited.
 *
 * UI: still collapse residual 400/403 / VALIDATION / FORBIDDEN to `loginFailed`
 * so client-side validators and legacy BA envelopes never leak distinct copy.
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

/**
 * Map errors for **public sign-up** only.
 * Collapse existence / validation residuals to one copy (no account enumeration).
 * 403 = signup disabled on the API (flag off) — distinct so the user can go to login.
 */
export function signupErrorMessage(err: unknown, m: Messages): string {
  const { status, code } = resolveStatusCode(err)
  if (status === 429 || code === 'RATE_LIMITED') return m.errRateLimited
  if (status === 403 || code === 'FORBIDDEN') return m.signUpDisabled
  if (
    status === 400 ||
    status === 401 ||
    status === 409 ||
    status === 422 ||
    code === 'UNAUTHORIZED' ||
    code === 'VALIDATION_ERROR' ||
    code === 'CONFLICT'
  ) {
    return m.signUpFailed
  }
  return apiErrorToMessage(err, m)
}
