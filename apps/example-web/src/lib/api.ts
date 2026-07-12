import type { ApiErrorBody } from '@gosilex/types'

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
