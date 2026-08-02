import type { ApiErrorBody, ErrorCodeName } from '@gosilex/types'

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

export type ApiClientOptions = {
  baseUrl?: string
  /** Default `'include'` for cookie sessions. */
  credentials?: RequestCredentials
  fetch?: typeof fetch
  defaultHeaders?: HeadersInit
  /** Called on HTTP 401 before throw — app clears session / redirects. */
  onUnauthorized?: (err: ApiError) => void
}

export type ApiFetch = <T>(path: string, init?: RequestInit) => Promise<T>

export function createApiClient(opts: ApiClientOptions = {}): { apiFetch: ApiFetch } {
  const baseUrl = opts.baseUrl ?? ''
  const credentials = opts.credentials ?? 'include'
  const fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis)

  const apiFetch: ApiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const headers = new Headers(opts.defaultHeaders)
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => {
        headers.set(key, value)
      })
    }
    if (init?.body != null && !headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    }

    const res = await fetchFn(`${baseUrl}${path}`, {
      ...init,
      credentials,
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
      if (body?.error?.code) {
        const err = new ApiError(res.status, body)
        if (res.status === 401) {
          opts.onUnauthorized?.(err)
        }
        throw err
      }
      throw new Error(`HTTP ${res.status}`)
    }

    return data as T
  }

  return { apiFetch }
}

/** One-shot helper; prefer `createApiClient` when sharing options across calls. */
export function apiFetch<T>(path: string, init?: RequestInit, opts?: ApiClientOptions): Promise<T> {
  return createApiClient(opts).apiFetch<T>(path, init)
}

export type ApiErrorMessageOptions = {
  fallback: string
  /** ErrorCode → user string; app owns i18n — package never hardcodes FR/EN. */
  messages?: Partial<Record<ErrorCodeName, string>>
}

/**
 * Map API / unknown errors to a user-facing string.
 * Prefer catalog[ErrorCode] → wire message → fallback.
 */
export function apiErrorToMessage(
  err: unknown,
  opts: ApiErrorMessageOptions | string = 'Error',
): string {
  const fallback = typeof opts === 'string' ? opts : opts.fallback
  const messages = typeof opts === 'string' ? undefined : opts.messages

  if (err instanceof ApiError) {
    const fromCatalog = messages?.[err.code as ErrorCodeName]
    if (fromCatalog) return fromCatalog
    return err.message || err.code || fallback
  }
  if (err instanceof Error && err.message) {
    return err.message
  }
  return fallback
}
