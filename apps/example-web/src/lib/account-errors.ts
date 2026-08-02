import type { Messages } from '../messages/fr'
import { ApiError, apiErrorToMessage } from './api'

/**
 * Map BA / kit errors for account self-service toasts.
 * BA often returns non-kit envelopes → `Error('HTTP {status}')` from apiFetch.
 */
export function accountErrorMessage(err: unknown, m: Messages): string {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.code === 'UNAUTHORIZED') return m.changePasswordReauth
    if (err.status === 429 || err.code === 'RATE_LIMITED') return m.errRateLimited
    if (err.status === 400 || err.status === 403) return m.changePasswordWrong
    return apiErrorToMessage(err, m)
  }
  if (err instanceof Error) {
    const match = /^HTTP (\d{3})$/.exec(err.message)
    if (match) {
      const status = Number(match[1])
      if (status === 401) return m.changePasswordReauth
      if (status === 429) return m.errRateLimited
      if (status === 400 || status === 403) return m.changePasswordWrong
    }
    return apiErrorToMessage(err, m)
  }
  return apiErrorToMessage(err, m)
}
