/**
 * B-account go-silex/silex-boilerplate#60 — change-password smoke + secret hygiene + me.name
 */
import { describe, expect, it } from 'vitest'
import { TENANCY_PASSWORD } from './seed/tenancy-data'
import {
  createSeededDemoApi,
  loginCookie,
  TEST_ORIGIN as ORIGIN,
  sessionHeaders,
} from './test/api-fixture'

const BA_ENV = {
  BETTER_AUTH_SECRET: 'test-better-auth-secret-at-least-32!!',
  BETTER_AUTH_URL: 'http://localhost:8787',
  ALLOW_PUBLIC_SIGNUP: 'false',
  ENVIRONMENT: 'test',
  CORS_ORIGINS: ORIGIN,
  EMAIL_TRANSPORT: 'log',
}

function assertNoPasswordMaterial(text: string, ...plaintexts: string[]) {
  const lower = text.toLowerCase()
  for (const p of plaintexts) {
    expect(lower).not.toContain(p.toLowerCase())
  }
  expect(text).not.toMatch(/"password"\s*:/)
  expect(text).not.toMatch(/"currentPassword"\s*:/)
  expect(text).not.toMatch(/"newPassword"\s*:/)
  expect(text).not.toMatch(/passwordHash|password_hash/i)
}

async function seedEnv() {
  return createSeededDemoApi({ env: BA_ENV, seed: { notes: false, environment: 'test' } })
}

describe('account self-service (B-account go-silex/silex-boilerplate#60)', () => {
  it('SC5: GET /api/me includes name from BA user', async () => {
    const { app, env } = await seedEnv()
    const cookie = await loginCookie(app, env, 'staff@kit.local', TENANCY_PASSWORD)
    const res = await app.request('/api/me', { headers: { cookie } }, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { name?: string; email?: string; subject: string }
    expect(body.email).toBe('staff@kit.local')
    expect(body.name).toBe('Staff Agent')
  })

  it('SC1/SC9: change-password happy path; old dies; no password fields in response', async () => {
    const { app, env } = await seedEnv()
    const email = 'solo@kit.local'
    const cookie = await loginCookie(app, env, email, TENANCY_PASSWORD)
    const newPassword = 'new-solo-password-60'

    const res = await app.request(
      '/api/auth/change-password',
      {
        method: 'POST',
        headers: sessionHeaders(cookie, undefined, ORIGIN),
        body: JSON.stringify({
          currentPassword: TENANCY_PASSWORD,
          newPassword,
          revokeOtherSessions: false,
        }),
      },
      env,
    )
    expect(res.status, `change-password → ${res.status}`).toBeLessThan(400)
    const text = await res.text()
    assertNoPasswordMaterial(text, TENANCY_PASSWORD, newPassword)

    // Login with new password works
    const loginNew = await app.request(
      '/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({ email, password: newPassword }),
      },
      env,
    )
    expect(loginNew.status).toBeLessThan(400)

    // Old password no longer works
    const loginOld = await app.request(
      '/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({ email, password: TENANCY_PASSWORD }),
      },
      env,
    )
    expect(loginOld.status).toBeGreaterThanOrEqual(400)
  })

  it('SC3/SC9: wrong current password fails; credential unchanged; no secret leak', async () => {
    const { app, env } = await seedEnv()
    const email = 'staff@kit.local'
    const cookie = await loginCookie(app, env, email, TENANCY_PASSWORD)
    const wrongCurrent = 'definitely-not-the-password'
    const attemptedNew = 'another-new-password-xx'

    const res = await app.request(
      '/api/auth/change-password',
      {
        method: 'POST',
        headers: sessionHeaders(cookie, undefined, ORIGIN),
        body: JSON.stringify({
          currentPassword: wrongCurrent,
          newPassword: attemptedNew,
          revokeOtherSessions: true,
        }),
      },
      env,
    )
    expect(res.status).toBeGreaterThanOrEqual(400)
    const text = await res.text()
    assertNoPasswordMaterial(text, wrongCurrent, attemptedNew)

    // Original password still works
    const stillOld = await app.request(
      '/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({ email, password: TENANCY_PASSWORD }),
      },
      env,
    )
    expect(stillOld.status).toBeLessThan(400)

    // Attempted new password must not work
    const notNew = await app.request(
      '/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({ email, password: attemptedNew }),
      },
      env,
    )
    expect(notNew.status).toBeGreaterThanOrEqual(400)
  })

  it('SC4/SC5: update-user name then me reflects it', async () => {
    const { app, env } = await seedEnv()
    const cookie = await loginCookie(app, env, 'solo@kit.local', TENANCY_PASSWORD)
    const newName = 'Solo Renamed 60'

    const upd = await app.request(
      '/api/auth/update-user',
      {
        method: 'POST',
        headers: sessionHeaders(cookie, undefined, ORIGIN),
        body: JSON.stringify({ name: newName }),
      },
      env,
    )
    expect(upd.status, `update-user → ${upd.status}`).toBeLessThan(400)
    const updText = await upd.text()
    assertNoPasswordMaterial(updText)

    const me = await app.request('/api/me', { headers: { cookie } }, env)
    expect(me.status).toBe(200)
    const body = (await me.json()) as { name?: string }
    expect(body.name).toBe(newName)
  })
})
