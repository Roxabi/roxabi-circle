import type { ApiErrorBody, ErrorCodeName } from '@gosilex/types'
import type { Messages } from '../messages/fr'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  readonly code: string
  readonly requestId: string
  readonly status: number
  readonly details?: unknown

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message)
    this.name = 'ApiError'
    this.status = status
    this.code = body.error.code
    this.requestId = body.requestId
    this.details = body.error.details
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
 * Prefer ErrorCode → catalog (`m`); fall back to wire message then code.
 */
export function apiErrorToMessage(err: unknown, fallback: string | Messages = 'Error'): string {
  const m = typeof fallback === 'string' ? null : fallback
  const fb = typeof fallback === 'string' ? fallback : fallback.error

  if (err instanceof ApiError) {
    if (m) {
      const key = CODE_TO_MSG[err.code as ErrorCodeName]
      if (key && m[key]) return m[key] as string
    }
    return err.message || err.code || fb
  }
  if (err instanceof Error && err.message) {
    return err.message
  }
  return fb
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body != null && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text) as unknown
    } catch {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      throw new Error('Invalid JSON response')
    }
  }
  if (!res.ok) {
    const body = data as ApiErrorBody
    if (body?.error?.code) throw new ApiError(res.status, body)
    throw new Error(`HTTP ${res.status}`)
  }
  return data as T
}
