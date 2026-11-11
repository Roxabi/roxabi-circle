import { meResponseSchema } from '@kit/api-client/me'
import { baAccount } from '@kit/auth/schema'
import { createDb } from '@kit/db'
import { describe, expect, it } from 'vitest'
import { demoUsers, schema } from '../db/schema'
import { isModuleEffective } from '../services/platform-modules'
import { createApiTestContext, loginCookie, TEST_ORIGIN } from '../test/api-fixture'
import { createMemoryEnv } from '../test/memory-env'
import { SEED_NOTES, SEED_USERS } from './demo-data'
import { ensureDemoUsers, seedDemoDatabase } from './seed-db'
import { TENANCY_PASSWORD } from './tenancy-data'

describe('seedDemoDatabase', () => {
  it('uses independent salted credentials across identities and fresh databases', async () => {
    const contexts = [createApiTestContext(), createApiTestContext()]
    const hashes: string[] = []
    for (const { app, env, db } of contexts) {
      await seedDemoDatabase(db, { notes: false, environment: 'test' })
      const accounts = await db.select().from(baAccount).all()
      for (const id of ['user_super', 'user_staff', 'user_demo']) {
        const hash = accounts.find((account) => account.userId === id)?.password
        expect(hash).toBeTruthy()
        hashes.push(hash!)
      }
      for (const [email, subject] of [
        ['staff@kit.local', 'user_staff'],
        ['demo@kit.local', 'user_demo'],
      ]) {
        const cookie = await loginCookie(app, env, email!, TENANCY_PASSWORD)
        const response = await app.request(
          '/api/me',
          { headers: { cookie, Origin: TEST_ORIGIN } },
          env,
        )
        expect(response.status).toBe(200)
        expect(meResponseSchema.parse(await response.json()).subject).toBe(subject)
      }
    }
    expect(new Set(hashes).size).toBe(hashes.length)
  })

  it('inserts users and notes once (idempotent)', async () => {
    const env = createMemoryEnv()
    const db = createDb(env.DB, schema)

    const first = await seedDemoDatabase(db, { now: 1_000, environment: 'test' })
    expect(first.reset).toBe(false)
    expect(first.users.every((u) => u.created)).toBe(true)
    expect(first.users).toHaveLength(SEED_USERS.length)
    expect(first.notes.every((n) => n.created)).toBe(true)
    expect(first.notes).toHaveLength(SEED_NOTES.length)

    // N0: tenancy seed makes demo platform-available; /api/modules.enabled maps that flag.
    expect(first.modules.find((m) => m.id === 'demo')?.enabled).toBe(true)
    // demo module needs no remote credentials
    expect(first.modules.find((m) => m.id === 'demo')?.configured).toBe(true)
    expect(await isModuleEffective(db, 'org_acme', 'demo')).toBe(true)
    expect(await isModuleEffective(db, 'org_team', 'demo')).toBe(true)
    expect(await isModuleEffective(db, 'org_beta', 'demo')).toBe(false)

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
