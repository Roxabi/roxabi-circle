import { AppError } from '@kit/core'
import { sql } from 'drizzle-orm'
import { rateLimitBuckets } from '../tenancy-schema'
import type { KitRepoDb } from './db-type'

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
  db: KitRepoDb,
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

/** Strict dotted-decimal IPv4, without URL's shorthand, octal or hexadecimal forms. */
function isIpv4(value: string): boolean {
  const parts = value.split('.')
  return (
    parts.length === 4 &&
    parts.every((part) => /^(0|[1-9][0-9]{0,2})$/.test(part) && Number(part) <= 255)
  )
}

/** Normalize a validated IPv6 literal to its /64, except IPv4-mapped addresses. */
function ipv6Bucket(value: string): string | null {
  if (!/^[0-9a-fA-F:.]+$/.test(value)) return null
  // The URL parser validates IPv6 syntax and serializes embedded IPv4 as hexadecimal.
  let hostname: string
  try {
    hostname = new URL(`http://[${value}]/`).hostname.slice(1, -1)
  } catch {
    return null
  }
  const [left, right] = hostname.split('::')
  const before = left ? left.split(':') : []
  const after = right ? right.split(':') : []
  const groups =
    right === undefined
      ? before
      : [...before, ...Array<string>(8 - before.length - after.length).fill('0'), ...after]

  if (groups.slice(0, 5).every((group) => group === '0') && groups[5] === 'ffff') {
    const high = Number.parseInt(groups[6], 16)
    const low = Number.parseInt(groups[7], 16)
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
  }
  return `${groups.slice(0, 4).join(':')}::/64`
}

/**
 * Client address bucket for rate-limit keys, or `null`. IPv6 shares a /64 bucket; IPv4-mapped
 * IPv6 uses its IPv4 bucket.
 *
 * An identity only behind the Cloudflare edge, which overwrites `cf-connecting-ip`. Off Cloudflare
 * (local, tests, any other runtime) the header is absent or caller-chosen. `null` when it is absent,
 * blank or not an IP literal — never `''`, so `clientIp(req) ?? fallback` reaches the fallback.
 * Never `X-Forwarded-For` (spoofable without a trusted proxy strip).
 */
export function clientIp(headers: { header: (name: string) => string | undefined }): string | null {
  const cf = headers.header('cf-connecting-ip')?.trim()
  if (!cf) return null
  if (isIpv4(cf)) return cf
  return cf.includes(':') ? ipv6Bucket(cf) : null
}

/** Test helper — clear all D1 rate-limit buckets. */
export async function resetRateLimits(db: KitRepoDb): Promise<void> {
  await db.delete(rateLimitBuckets)
}
