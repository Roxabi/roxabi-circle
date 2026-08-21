import type { ListPage } from '@kit/types'
import { AppError } from './errors'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const INVALID_CURSOR_MESSAGE = 'Invalid cursor'

export function clampListLimit(n: number | undefined): number {
  if (n == null || !Number.isFinite(n)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(n)))
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) {
    binary += String.fromCharCode(b)
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function base64UrlToBytes(cursor: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(cursor)) {
    throw AppError.validation(INVALID_CURSOR_MESSAGE)
  }
  const padded = cursor + '='.repeat((4 - (cursor.length % 4)) % 4)
  const b64 = padded.replaceAll('-', '+').replaceAll('_', '/')
  let binary: string
  try {
    binary = atob(b64)
  } catch {
    throw AppError.validation(INVALID_CURSOR_MESSAGE)
  }
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

/** Opaque-by-convention cursor (base64url JSON keyset). Not a security boundary. */
export function encodeListCursor(keyset: Record<string, string | number>): string {
  const json = JSON.stringify(keyset)
  return bytesToBase64Url(new TextEncoder().encode(json))
}

/**
 * Generic decode only. Callers must validate endpoint-specific keysets before SQL.
 * Malformed / non-object / nested / non-finite → VALIDATION_ERROR (generic message).
 */
export function decodeListCursor(cursor: string): Record<string, string | number> {
  let parsed: unknown
  try {
    const text = new TextDecoder().decode(base64UrlToBytes(cursor))
    parsed = JSON.parse(text) as unknown
  } catch (e) {
    if (e instanceof AppError) throw e
    throw AppError.validation(INVALID_CURSOR_MESSAGE)
  }

  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw AppError.validation(INVALID_CURSOR_MESSAGE)
  }

  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === 'string') {
      out[k] = v
      continue
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v
      continue
    }
    throw AppError.validation(INVALID_CURSOR_MESSAGE)
  }

  if (Object.keys(out).length === 0) {
    throw AppError.validation(INVALID_CURSOR_MESSAGE)
  }

  return out
}

/**
 * `rows` must already be fetched with `limit+1`.
 * Returns items = rows[0..limit) and nextCursor from the last kept row via `keysetOf`.
 */
export function takeListPage<T>(
  rows: T[],
  limit: number,
  keysetOf: (row: T) => Record<string, string | number>,
): ListPage<T> {
  const hasMore = rows.length > limit
  const items = rows.slice(0, limit)
  if (!hasMore || items.length === 0) {
    return { items, nextCursor: null }
  }
  const last = items[items.length - 1]!
  return { items, nextCursor: encodeListCursor(keysetOf(last)) }
}
