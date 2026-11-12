import { baVerification } from '@kit/auth/schema'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { TENANCY_PASSWORD } from './seed/tenancy-data'
import { DEMO_EMAIL } from './services/auth'
import { createSeededDemoApi, loginCookie, sessionHeaders } from './test/api-fixture'
import {
  captureMail,
  expectTokenAbsentFromVerification,
  resetTokenFromLink,
} from './test/mail-capture'

const ORIGIN = 'http://localhost:5173'
async function seedEnv() {
  return createSeededDemoApi({
    env: {
      BETTER_AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID(),
      BETTER_AUTH_URL: 'http://localhost:8787',
      ALLOW_PUBLIC_SIGNUP: 'false',
      ENVIRONMENT: 'test',
      CORS_ORIGINS: ORIGIN,
    },
    seed: { notes: false, environment: 'test' },
  })
}

describe('verification migration and invitation onboarding', () => {
  it('consumes a plain pre-hash reset identifier once', async () => {
    const { app, env, db } = await seedEnv()
    const token = crypto.randomUUID()
    const identifier = `reset-password:${token}`
    await db.insert(baVerification).values({
      id: crypto.randomUUID(),
      identifier,
      value: 'user_demo',
      expiresAt: new Date(Date.now() + 60_000),
    })
    const reset = () =>
      app.request(
        '/api/auth/reset-password',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', Origin: ORIGIN },
          body: JSON.stringify({ token, newPassword: TENANCY_PASSWORD }),
        },
        env,
      )
    expect((await reset()).status).toBeLessThan(400)
    expect(
      await db.select().from(baVerification).where(eq(baVerification.identifier, identifier)),
    ).toHaveLength(0)
    expect((await reset()).status).toBeGreaterThanOrEqual(400)
    const cookie = await loginCookie(app, env, DEMO_EMAIL, TENANCY_PASSWORD, ORIGIN)
    expect(
      (await app.request('/api/me', { headers: { cookie, Origin: ORIGIN } }, env)).status,
    ).toBe(200)
  })

  it('consumes a plain current-format magic link once', async () => {
    const { app, env, db } = await seedEnv()
    const token = crypto.randomUUID()
    const identifier = `magic-link:${token}`
    await db.insert(baVerification).values({
      id: crypto.randomUUID(),
      identifier,
      value: JSON.stringify({ type: 'magic-link', email: DEMO_EMAIL }),
      expiresAt: new Date(Date.now() + 60_000),
    })
    const path = `/api/auth/magic-link/verify?${new URLSearchParams({ token, callbackURL: `${ORIGIN}/app` })}`
    const verify = await app.request(path, { headers: { Origin: ORIGIN } }, env)
    expect(verify.status).toBe(302)
    expect(verify.headers.get('location')).toBe(`${ORIGIN}/app`)
    const cookie = verify.headers.get('set-cookie')
    expect(cookie).toBeTruthy()
    expect(
      (await app.request('/api/me', { headers: { cookie: cookie!, Origin: ORIGIN } }, env)).status,
    ).toBe(200)
    expect(
      await db.select().from(baVerification).where(eq(baVerification.identifier, identifier)),
    ).toHaveLength(0)
    const replay = await app.request(path, { headers: { Origin: ORIGIN } }, env)
    expect(new URL(replay.headers.get('location')!).searchParams.get('error')).toBe('INVALID_TOKEN')
    expect(replay.headers.get('set-cookie')).toBeNull()
  })

  it('rejects old unprefixed magic records and expired current-format records without a session', async () => {
    const { app, env, db } = await seedEnv()
    for (const legacy of [true, false]) {
      const token = crypto.randomUUID()
      await db.insert(baVerification).values({
        id: crypto.randomUUID(),
        identifier: legacy ? token : `magic-link:${token}`,
        value: JSON.stringify(
          legacy ? { email: DEMO_EMAIL } : { type: 'magic-link', email: DEMO_EMAIL },
        ),
        expiresAt: new Date(Date.now() + (legacy ? 60_000 : -60_000)),
      })
      const path = `/api/auth/magic-link/verify?${new URLSearchParams({ token, callbackURL: `${ORIGIN}/app` })}`
      const response = await app.request(path, { headers: { Origin: ORIGIN } }, env)
      expect(response.status).toBe(302)
      expect(new URL(response.headers.get('location')!).searchParams.get('error')).toBe(
        'INVALID_TOKEN',
      )
      expect(response.headers.get('set-cookie')).toBeNull()
    }
  })

  it('invitation welcome mail sets a password once without storing its token in clear', async () => {
    const { app, env, db } = await seedEnv()
    const mail = captureMail()
    const cookie = await loginCookie(app, env, 'team-owner@kit.local', TENANCY_PASSWORD, ORIGIN)
    const email = 'invited-new@kit.local'
    const invitation = await app.request(
      '/api/orgs/org_team/invitations',
      {
        method: 'POST',
        headers: sessionHeaders(cookie, undefined, ORIGIN),
        body: JSON.stringify({ email, role: 'member' }),
      },
      env,
    )
    expect(invitation.status).toBe(201)
    const token = resetTokenFromLink(mail.link(email, 'Set your password'))
    await expectTokenAbsentFromVerification(db, token)
    const reset = () =>
      app.request(
        '/api/auth/reset-password',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', Origin: ORIGIN },
          body: JSON.stringify({ token, newPassword: TENANCY_PASSWORD }),
        },
        env,
      )
    expect((await reset()).status).toBeLessThan(400)
    expect((await reset()).status).toBeGreaterThanOrEqual(400)
    const invitedCookie = await loginCookie(app, env, email, TENANCY_PASSWORD, ORIGIN)
    expect(
      (await app.request('/api/me', { headers: { cookie: invitedCookie, Origin: ORIGIN } }, env))
        .status,
    ).toBe(200)
  })
})
