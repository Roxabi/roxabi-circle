import {
  ApiError,
  createApiClient,
  apiErrorToMessage as kitApiErrorToMessage,
  apiFetch as kitApiFetch,
} from '@gosilex/api-client'
import type { ErrorCodeName } from '@gosilex/types'
import type { Messages } from '../messages/fr'

export { ApiError, createApiClient }

const API_BASE = import.meta.env.VITE_API_URL ?? ''

const CODE_TO_MSG: Record<ErrorCodeName, keyof Messages> = {
  UNAUTHORIZED: 'errUnauthorized',
  FORBIDDEN: 'errForbidden',
  NOT_FOUND: 'errNotFound',
  VALIDATION_ERROR: 'errValidation',
  CONFLICT: 'errConflict',
  INTERNAL_ERROR: 'errInternal',
  RATE_LIMITED: 'errRateLimited',
  INTEGRATION_NOT_CONFIGURED: 'errIntegrationNotConfigured',
}

/**
 * Map API / unknown errors to a user-facing string.
 * Prefer ErrorCode → app catalog (`m`); fall back to wire message then code.
 * App-owned i18n bridge over `@gosilex/api-client`.
 */
export function apiErrorToMessage(err: unknown, fallback: string | Messages = 'Error'): string {
  if (typeof fallback === 'string') {
    return kitApiErrorToMessage(err, fallback)
  }
  const m = fallback
  const messages = Object.fromEntries(
    (Object.keys(CODE_TO_MSG) as ErrorCodeName[]).map((code) => {
      const key = CODE_TO_MSG[code]
      return [code, m[key] as string]
    }),
  ) as Partial<Record<ErrorCodeName, string>>
  return kitApiErrorToMessage(err, { fallback: m.error, messages })
}

/** Cookie session client — baseUrl from Vite env. */
export function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return kitApiFetch<T>(path, init, { baseUrl: API_BASE })
}
