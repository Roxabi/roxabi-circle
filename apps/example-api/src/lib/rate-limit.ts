import { AppError } from '@gosilex/core'

/** In-memory sliding window (demo Worker single-isolate). Not multi-region. */
const buckets = new Map<string, number[]>()

/**
 * Fail closed when `limit` hits occur within `windowMs` for `key`.
 * Throws `AppError.rateLimited` (429).
 */
export function assertRateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now()
  const prev = buckets.get(key) ?? []
  const hits = prev.filter((t) => now - t < windowMs)
  if (hits.length >= limit) {
    // Keep the full window so subsequent calls still see the limit.
    buckets.set(key, hits)
    throw AppError.rateLimited()
  }
  hits.push(now)
  if (hits.length === 0) {
    buckets.delete(key)
  } else {
    buckets.set(key, hits)
  }
}

/**
 * Client IP for rate limits. Prefer Cloudflare `cf-connecting-ip`.
 * Do not trust raw `X-Forwarded-For` (spoofable without a trusted proxy strip).
 */
export function clientIp(headers: { header: (name: string) => string | undefined }): string {
  const cf = headers.header('cf-connecting-ip')?.trim()
  if (cf) return cf
  return 'local'
}

/** Test helper — clear all buckets. */
export function resetRateLimits(): void {
  buckets.clear()
}
