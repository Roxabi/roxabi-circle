import { baSession } from '@kit/auth/schema'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { TENANCY_PASSWORD } from './seed/tenancy-data'
import { createSeededDemoApi, loginCookie, sessionHeaders, signIn } from './test/api-fixture'

const day = 24 * 60 * 60 * 1000

describe('session HTTP regressions', () => {
  it('rejects missing, invalid, expired and deleted sessions on the next request', async () => {
    const { app, env, db } = await createSeededDemoApi({
      seed: { notes: false, environment: 'test' },
    })
    const cookie = await loginCookie(app, env, 'staff@kit.local', TENANCY_PASSWORD)
    const me = (value?: string) =>
      app.request('/api/me', { headers: value ? { cookie: value } : {} }, env)

    expect((await me()).status).toBe(401)
    expect((await me(`${cookie}invalid`)).status).toBe(401)
    expect((await me(cookie)).status).toBe(200)
    await db
      .update(baSession)
      .set({ expiresAt: new Date(Date.now() - day) })
      .where(eq(baSession.userId, 'user_staff'))
    expect((await me(cookie)).status).toBe(401)

    const fresh = await loginCookie(app, env, 'staff@kit.local', TENANCY_PASSWORD)
    expect((await me(fresh)).status).toBe(200)
    await db.delete(baSession).where(eq(baSession.userId, 'user_staff'))
    expect((await me(fresh)).status).toBe(401)
  })

  it('refreshes through Better Auth HTTP with cookie attributes, then observes revocation', async () => {
    const { app, env, db } = await createSeededDemoApi({
      seed: { notes: false, environment: 'test' },
    })
    const { cookie, setCookie } = await signIn(app, env, {
      email: 'staff@kit.local',
      password: TENANCY_PASSWORD,
    })
    const name = cookie.split('=')[0]!
    expect(setCookie).toMatch(/httponly/i)
    expect(setCookie).toMatch(/samesite=lax/i)
    expect(setCookie).toMatch(/path=\//i)

    const oldExpiry = Date.now() + 5 * day
    await db
      .update(baSession)
      .set({
        updatedAt: new Date(Date.now() - 2 * day),
        expiresAt: new Date(oldExpiry),
      })
      .where(eq(baSession.userId, 'user_staff'))
    const refresh = await app.request(
      '/api/auth/get-session',
      { headers: sessionHeaders(cookie) },
      env,
    )
    expect(refresh.status).toBe(200)
    const body = (await refresh.json()) as { user: { id: string } }
    expect(body.user.id).toBe('user_staff')
    const rotated = refresh.headers.get('set-cookie') ?? ''
    expect(rotated).toContain(`${name}=`)
    expect(rotated).toMatch(/httponly/i)
    expect(rotated).toMatch(/samesite=lax/i)
    expect(rotated).toMatch(/path=\//i)
    const [session] = await db.select().from(baSession).where(eq(baSession.userId, 'user_staff'))
    expect(session!.expiresAt.getTime()).toBeGreaterThan(oldExpiry)

    const refreshedCookie = rotated.split(';', 1)[0]!
    expect(
      (await app.request('/api/me', { headers: sessionHeaders(refreshedCookie) }, env)).status,
    ).toBe(200)
    await db.delete(baSession).where(eq(baSession.userId, 'user_staff'))
    expect(
      (await app.request('/api/me', { headers: sessionHeaders(refreshedCookie) }, env)).status,
    ).toBe(401)
    const revoked = await app.request(
      '/api/auth/get-session',
      { headers: sessionHeaders(refreshedCookie) },
      env,
    )
    expect(revoked.status).toBe(200)
    expect(await revoked.json()).toBeNull()
  })
})
