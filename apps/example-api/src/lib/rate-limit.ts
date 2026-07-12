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
    throw AppError.rateLimited()
  }
  hits.push(now)
  buckets.set(key, hits)
}

/** Test helper — clear all buckets. */
export function resetRateLimits(): void {
  buckets.clear()
}
