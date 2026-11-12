import {
  ApiError,
  type ApiFetchInit,
  apiErrorFieldErrors,
  fieldErrorsFirstMessages,
  HttpError,
  apiErrorToMessage as kitApiErrorToMessage,
  apiFetch as kitApiFetch,
} from '@kit/api-client'
import type { ErrorCodeName } from '@kit/types'
import type { Messages } from '../messages/fr'

export { ApiError, apiErrorFieldErrors, fieldErrorsFirstMessages, HttpError }

const API_BASE = import.meta.env.VITE_API_URL ?? ''
let principalGeneration = 0
let impersonationId = 'none'

export function invalidatePrincipalGeneration(): void {
  principalGeneration += 1
}

export function setImpersonationFence(id: string | null): boolean {
  const next = id ?? 'none'
  if (next === impersonationId) return false
  impersonationId = next
  invalidatePrincipalGeneration()
  return true
}

export class StalePrincipalError extends Error {
  constructor() {
    super('Response belongs to an earlier principal')
  }
}

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
 * App-owned i18n bridge over `@kit/api-client`.
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
export async function apiFetch<T>(path: string, init?: ApiFetchInit<T>): Promise<T> {
  const generation = principalGeneration
  const headers = new Headers(init?.headers)
  headers.set('X-Impersonation-Id', impersonationId)
  try {
    const result = await kitApiFetch<T>(path, { ...init, headers }, { baseUrl: API_BASE })
    if (generation !== principalGeneration) throw new StalePrincipalError()
    return result
  } catch (error) {
    if (generation !== principalGeneration) throw new StalePrincipalError()
    throw error
  }
}
