import { AppError } from '@kit/core'
import { createDb } from '@kit/db'
import { describe, expect, it, vi } from 'vitest'
import { schema } from './db/schema'
import { assertRateLimit, resetRateLimits } from './lib/rate-limit'
import { createMemoryEnv } from './test/memory-env'

describe('D1 rate limit (B-auth-harden #61)', () => {
  it('allows up to limit then 429 with retryAfterSeconds', async () => {
    const env = createMemoryEnv()
    const db = createDb(env.DB as unknown as D1Database, schema)
    await assertRateLimit(db, 'k:a', 3, 60_000)
    await assertRateLimit(db, 'k:a', 3, 60_000)
    await assertRateLimit(db, 'k:a', 3, 60_000)
    await expect(assertRateLimit(db, 'k:a', 3, 60_000)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
    })
  })

  it('isolates keys', async () => {
    const env = createMemoryEnv()
    const db = createDb(env.DB as unknown as D1Database, schema)
    for (let i = 0; i < 3; i++) await assertRateLimit(db, 'k:1', 3, 60_000)
    await expect(assertRateLimit(db, 'k:1', 3, 60_000)).rejects.toBeInstanceOf(AppError)
    await expect(assertRateLimit(db, 'k:2', 3, 60_000)).resolves.toBeUndefined()
  })

  it('resetRateLimits clears buckets', async () => {
    const env = createMemoryEnv()
    const db = createDb(env.DB as unknown as D1Database, schema)
    for (let i = 0; i < 3; i++) await assertRateLimit(db, 'k:r', 3, 60_000)
    await resetRateLimits(db)
    await expect(assertRateLimit(db, 'k:r', 3, 60_000)).resolves.toBeUndefined()
  })

  it('concurrent awaits on same key do not under-count past limit', async () => {
    const env = createMemoryEnv()
    const db = createDb(env.DB as unknown as D1Database, schema)
    const limit = 5
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => assertRateLimit(db, 'k:race', limit, 60_000)),
    )
    const ok = results.filter((r) => r.status === 'fulfilled').length
    const limited = results.filter(
      (r) =>
        r.status === 'rejected' && r.reason instanceof AppError && r.reason.code === 'RATE_LIMITED',
    ).length
    expect(ok).toBeLessThanOrEqual(limit)
    expect(ok + limited).toBe(20)
    expect(limited).toBeGreaterThan(0)
  })

  it('D1 failure fail-closes with INTERNAL_ERROR (no pass-through)', async () => {
    const env = createMemoryEnv()
    const db = createDb(env.DB as unknown as D1Database, schema)
    const spy = vi.spyOn(db, 'insert').mockImplementation(() => {
      throw new Error('d1 down')
    })
    await expect(assertRateLimit(db, 'k:fail', 10, 60_000)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      status: 500,
    })
    spy.mockRestore()
  })
})
