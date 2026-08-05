import { createDb } from '@gosilex/db'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import { baUser, baVerification } from './db/better-auth-schema'
import { schema } from './db/schema'
import { assertRateLimit } from './lib/rate-limit'
import { seedDemoDatabase } from './seed/seed-db'
import { DEMO_EMAIL } from './services/auth'
import { createMemoryEnv } from './test/memory-env'

const ORIGIN = 'http://localhost:5173'

const BA_ENV = {
  BETTER_AUTH_SECRET: 'test-better-auth-secret-at-least-32!!',
  BETTER_AUTH_URL: 'http://localhost:8787',
  // Default kit: no public signup — magic must not mint accounts
  ALLOW_PUBLIC_SIGNUP: 'false',
  ENVIRONMENT: 'test',
  CORS_ORIGINS: ORIGIN,
  EMAIL_TRANSPORT: 'log',
}

async function seedEnv() {
  const app = createApp()
  const env = createMemoryEnv(BA_ENV)
  const db = createDb(env.DB as unknown as D1Database, schema)
  await seedDemoDatabase(db, { notes: false, environment: 'test' })
  return { app, env, db }
}

async function verificationCount(db: ReturnType<typeof createDb>): Promise<number> {
  const rows = await db.select().from(baVerification)
  return rows.length
}

async function userCountByEmail(db: ReturnType<typeof createDb>, email: string): Promise<number> {
  const rows = await db.select().from(baUser).where(eq(baUser.email, email))
  return rows.length
}

describe('magic link (B-magic #59)', () => {
  it('request for known email returns success and stores a verification row', async () => {
    const { app, env, db } = await seedEnv()
    const before = await verificationCount(db)
    const res = await app.request(
      '/api/auth/sign-in/magic-link',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({
          email: DEMO_EMAIL,
          callbackURL: `${ORIGIN}/app`,
        }),
      },
      env,
    )
    expect(res.status, await res.clone().text()).toBeLessThan(400)
    const bodyText = await res.text()
    // Never dump raw tokens in assertions beyond presence checks
    expect(bodyText).not.toMatch(/password/i)
    const after = await verificationCount(db)
    expect(after).toBeGreaterThan(before)
  })

  it('request for unknown email does not create a user when signup disabled', async () => {
    const { app, env, db } = await seedEnv()
    const unknown = 'nobody-magic@gosilex.local'
    expect(await userCountByEmail(db, unknown)).toBe(0)

    const res = await app.request(
      '/api/auth/sign-in/magic-link',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({
          email: unknown,
          callbackURL: `${ORIGIN}/app`,
        }),
      },
      env,
    )
    // BA may return 2xx (email “sent”) even when user missing; user must not appear
    expect(res.status).toBeLessThan(500)
    expect(await userCountByEmail(db, unknown)).toBe(0)
  })

  it('magic-link path is rate-limited via BA_SENSITIVE', async () => {
    const app = createApp()
    const env = createMemoryEnv(BA_ENV)
    const db = createDb(env.DB as unknown as D1Database, schema)
    const windowMs = 15 * 60 * 1000
    for (let i = 0; i < 20; i++) {
      await assertRateLimit(db, 'ba-auth:198.51.100.10', 20, windowMs)
    }
    const blocked = await app.request(
      '/api/auth/sign-in/magic-link',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Origin: ORIGIN,
          'cf-connecting-ip': '198.51.100.10',
        },
        body: JSON.stringify({ email: 'rate@example.com', callbackURL: `${ORIGIN}/app` }),
      },
      env,
    )
    expect(blocked.status).toBe(429)
    const body = (await blocked.json()) as { error: { code: string } }
    expect(body.error.code).toBe('RATE_LIMITED')
  })

  it('magic-link/verify path is rate-limited via BA_SENSITIVE', async () => {
    const app = createApp()
    const env = createMemoryEnv(BA_ENV)
    const db = createDb(env.DB as unknown as D1Database, schema)
    const windowMs = 15 * 60 * 1000
    for (let i = 0; i < 20; i++) {
      await assertRateLimit(db, 'ba-auth:198.51.100.11', 20, windowMs)
    }
    const blocked = await app.request(
      '/api/auth/magic-link/verify?token=not-a-real-token',
      {
        method: 'GET',
        headers: {
          Origin: ORIGIN,
          'cf-connecting-ip': '198.51.100.11',
        },
      },
      env,
    )
    expect(blocked.status).toBe(429)
  })
})
