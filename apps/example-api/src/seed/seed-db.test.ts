import { createDb } from '@kit/db'
import { describe, expect, it } from 'vitest'
import { demoUsers, schema } from '../db/schema'
import { createMemoryEnv } from '../test/memory-env'
import { SEED_NOTES, SEED_USERS } from './demo-data'
import { ensureDemoUsers, seedDemoDatabase } from './seed-db'

describe('seedDemoDatabase', () => {
  it('inserts users and notes once (idempotent)', async () => {
    const env = createMemoryEnv()
    const db = createDb(env.DB, schema)

    const first = await seedDemoDatabase(db, { now: 1_000, environment: 'test' })
    expect(first.reset).toBe(false)
    expect(first.users.every((u) => u.created)).toBe(true)
    expect(first.users).toHaveLength(SEED_USERS.length)
    expect(first.notes.every((n) => n.created)).toBe(true)
    expect(first.notes).toHaveLength(SEED_NOTES.length)

    expect(first.modules.find((m) => m.id === 'feedback')?.enabled).toBe(false)
    expect(first.modules.find((m) => m.id === 'feedback')?.configured).toBe(false)

    const second = await seedDemoDatabase(db, { now: 2_000, environment: 'test' })
    expect(second.users.every((u) => !u.created)).toBe(true)
    expect(second.notes.every((n) => !n.created)).toBe(true)
  })

  it('reset clears and re-seeds', async () => {
    const env = createMemoryEnv()
    const db = createDb(env.DB, schema)

    await seedDemoDatabase(db, { now: 1_000, environment: 'test' })
    const afterReset = await seedDemoDatabase(db, { reset: true, now: 9_000, environment: 'test' })
    expect(afterReset.reset).toBe(true)
    expect(afterReset.users.every((u) => u.created)).toBe(true)
    expect(afterReset.notes.every((n) => n.created)).toBe(true)
    expect(afterReset.users).toHaveLength(SEED_USERS.length)
    expect(afterReset.notes).toHaveLength(SEED_NOTES.length)
  })
})

describe('ensureDemoUsers env gate', () => {
  it('seeds only for development|test', async () => {
    const env = createMemoryEnv()
    const db = createDb(env.DB, schema)

    await ensureDemoUsers(db, { environment: 'production' })
    expect((await db.select().from(demoUsers).all()).length).toBe(0)

    await ensureDemoUsers(db, { environment: 'staging' })
    expect((await db.select().from(demoUsers).all()).length).toBe(0)

    await ensureDemoUsers(db, { environment: undefined })
    expect((await db.select().from(demoUsers).all()).length).toBe(0)

    await ensureDemoUsers(db, { environment: 'test' })
    expect((await db.select().from(demoUsers).all()).length).toBe(SEED_USERS.length)
  })
})
