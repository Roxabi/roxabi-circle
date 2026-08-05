import { AppError } from '@kit/core'
import { sql } from 'drizzle-orm'
import { rateLimitBuckets } from '../db/schema'
import type { KitDb } from './db-type'

/**
 * Durable fixed-window rate limit on **D1** (shared across Workers isolates).
 *
 * Algorithm: floor-aligned windows
 *   windowStartMs = Math.floor(now / windowMs) * windowMs
 * Atomic counter: INSERT … ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count.
 *
 * Caveats (documented for ops):
 * - Multi-isolate safety comes from D1, not process memory.
 * - Floor windows allow ~2× the limit across a boundary (not a sliding Map).
 * - Fail-closed: D1 errors → AppError.internal (500), never skip the limit.
 *
 * Escape hatch (not implemented): KV or Cloudflare Rate Limiting binding.
 */

/**
 * Fail closed when `limit` hits occur within the current window for `key`.
 * Throws `AppError.rateLimited` (429) with `retryAfterSeconds` for remaining window.
 */
export async function assertRateLimit(
  db: KitDb,
  key: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  if (limit < 1 || windowMs < 1) {
    throw AppError.internal('Invalid rate limit configuration')
  }
  const now = Date.now()
  const windowStartMs = Math.floor(now / windowMs) * windowMs

  try {
    // Lazy GC of expired windows for this key (best-effort; ignore errors).
    try {
      await db
        .delete(rateLimitBuckets)
        .where(
          sql`${rateLimitBuckets.bucketKey} = ${key} AND ${rateLimitBuckets.windowStartMs} + ${windowMs} < ${now}`,
        )
    } catch {
      // ignore GC failures
    }

    const rows = await db
      .insert(rateLimitBuckets)
      .values({ bucketKey: key, windowStartMs, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimitBuckets.bucketKey, rateLimitBuckets.windowStartMs],
        set: { count: sql`${rateLimitBuckets.count} + 1` },
      })
      .returning({ count: rateLimitBuckets.count })

    const count = rows[0]?.count
    if (count == null) {
      throw AppError.internal('Rate limit counter returned no row')
    }
    if (count > limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((windowStartMs + windowMs - now) / 1000))
      throw AppError.rateLimited('Too many requests', { retryAfterSeconds })
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    throw AppError.internal('Rate limit store unavailable')
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

/** Test helper — clear all D1 rate-limit buckets. */
export async function resetRateLimits(db: KitDb): Promise<void> {
  await db.delete(rateLimitBuckets)
}
