import { createDb } from '@gosilex/db'
import { like } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { baVerification } from './db/better-auth-schema'
import { schema } from './db/schema'
import { resetRateLimits } from './lib/rate-limit'
import { seedDemoDatabase } from './seed/seed-db'
import { DEMO_EMAIL, DEMO_PASSWORD } from './services/auth'
import { createMemoryEnv } from './test/memory-env'

const ORIGIN = 'http://localhost:5173'

const BA_ENV = {
  BETTER_AUTH_SECRET: 'test-better-auth-secret-at-least-32!!',
  BETTER_AUTH_URL: 'http://localhost:8787',
  ALLOW_PUBLIC_SIGNUP: 'true',
  ENVIRONMENT: 'test',
  CORS_ORIGINS: ORIGIN,
}

async function seedEnv() {
  const app = createApp()
  const env = createMemoryEnv(BA_ENV)
  const db = createDb(env.DB as unknown as D1Database, schema)
  await seedDemoDatabase(db, { notes: false, environment: 'test' })
  return { app, env, db }
}

async function latestResetToken(db: ReturnType<typeof createDb>): Promise<string | null> {
  const rows = await db
    .select()
    .from(baVerification)
    .where(like(baVerification.identifier, 'reset-password:%'))
  const row = rows[rows.length - 1]
  if (!row?.identifier) return null
  return row.identifier.replace(/^reset-password:/, '')
}

beforeEach(() => {
  resetRateLimits()
})

describe('password reset (B3 S3)', () => {
  it('request for known email returns generic success and stores token', async () => {
    const { app, env, db } = await seedEnv()
    const res = await app.request(
      '/api/auth/request-password-reset',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({
          email: DEMO_EMAIL,
          redirectTo: `${ORIGIN}/reset-password`,
        }),
      },
      env,
    )
    expect(res.status).toBeLessThan(400)
    const body = (await res.json()) as { status?: boolean; message?: string }
    expect(body.status).toBe(true)
    const token = await latestResetToken(db)
    expect(token).toBeTruthy()
  })

  it('request for unknown email still returns generic success (no enumeration)', async () => {
    const { app, env } = await seedEnv()
    const res = await app.request(
      '/api/auth/request-password-reset',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({
          email: 'nobody-exists@gosilex.local',
          redirectTo: `${ORIGIN}/reset-password`,
        }),
      },
      env,
    )
    expect(res.status).toBeLessThan(400)
    const body = (await res.json()) as { status?: boolean; message?: string }
    expect(body.status).toBe(true)
    expect(body.message).toMatch(/email/i)
  })

  it('reset with token → new password works; old fails; token single-use', async () => {
    const { app, env, db } = await seedEnv()
    const req = await app.request(
      '/api/auth/request-password-reset',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({
          email: DEMO_EMAIL,
          redirectTo: `${ORIGIN}/reset-password`,
        }),
      },
      env,
    )
    expect(req.status).toBeLessThan(400)
    const token = await latestResetToken(db)
    expect(token).toBeTruthy()

    const newPassword = 'new-demo-password-xyz'
    const reset = await app.request(
      '/api/auth/reset-password',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({ newPassword, token }),
      },
      env,
    )
    expect(reset.status).toBeLessThan(400)

    const oldLogin = await app.request(
      '/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
      },
      env,
    )
    expect(oldLogin.status).toBeGreaterThanOrEqual(400)

    const newLogin = await app.request(
      '/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({ email: DEMO_EMAIL, password: newPassword }),
      },
      env,
    )
    expect(newLogin.status).toBeLessThan(400)

    const reuse = await app.request(
      '/api/auth/reset-password',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({ newPassword: 'another-password-1', token }),
      },
      env,
    )
    expect(reuse.status).toBeGreaterThanOrEqual(400)
  })

  it('request-password-reset is rate limited', async () => {
    const { app, env } = await seedEnv()
    let lastStatus = 200
    for (let i = 0; i < 25; i++) {
      const res = await app.request(
        '/api/auth/request-password-reset',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Origin: ORIGIN,
            'cf-connecting-ip': '203.0.113.50',
          },
          body: JSON.stringify({
            email: DEMO_EMAIL,
            redirectTo: `${ORIGIN}/reset-password`,
          }),
        },
        env,
      )
      lastStatus = res.status
      if (res.status === 429) break
    }
    expect(lastStatus).toBe(429)
  })
})
