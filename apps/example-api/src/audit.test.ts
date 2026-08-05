import { createDb } from '@kit/db'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from './app'
import { auditEvents, schema } from './db/schema'
import { seedDemoDatabase } from './seed/seed-db'
import { TENANCY_PASSWORD } from './seed/tenancy-data'
import * as auditService from './services/audit'
import { createMemoryEnv } from './test/memory-env'

const ORIGIN = 'http://localhost:5173'

const BA_ENV = {
  BETTER_AUTH_SECRET: 'test-better-auth-secret-at-least-32!!',
  BETTER_AUTH_URL: 'http://localhost:8787',
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

async function signIn(
  app: ReturnType<typeof createApp>,
  env: ReturnType<typeof createMemoryEnv>,
  email: string,
  password = TENANCY_PASSWORD,
) {
  const res = await app.request(
    '/api/auth/sign-in/email',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ email, password }),
    },
    env,
  )
  expect(res.status, `sign-in ${email}`).toBeLessThan(400)
  return res.headers.get('set-cookie')!.split(';')[0]!
}

describe('audit (B-auth-harden #61)', () => {
  it('sanitizeAuditMeta strips secrets and token URLs', () => {
    const clean = auditService.sanitizeAuditMeta('user.created', {
      emailDomain: 'example.com',
      password: 'secret',
      token: 'abc',
      setPasswordUrl: 'https://x/reset?token=evil',
      random: 'drop',
    })
    expect(clean).toEqual({ emailDomain: 'example.com' })
  })

  it('create user emits user.created + membership + optional platform_role', async () => {
    const { app, env, db } = await seedEnv()
    const cookie = await signIn(app, env, 'super@kit.local')
    const email = `audit-user-${Date.now()}@example.com`
    const res = await app.request(
      '/api/admin/users',
      {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
          Origin: ORIGIN,
        },
        body: JSON.stringify({
          email,
          platformRole: 'staff',
          memberships: [{ orgId: 'org_team', role: 'member' }],
        }),
      },
      env,
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { user: { id: string } }
    const rows = await db.select().from(auditEvents).where(eq(auditEvents.targetId, body.user.id))
    const actions = rows.map((r) => r.action).sort()
    expect(actions).toContain('user.created')
    expect(actions).toContain('platform_role.set')
    expect(actions).toContain('membership.add')
    for (const r of rows) {
      if (r.metaJson) {
        expect(r.metaJson).not.toMatch(/password|token=/i)
      }
    }
  })

  it('first_login is idempotent across two sessions', async () => {
    const { app, env, db } = await seedEnv()
    await signIn(app, env, 'super@kit.local')
    await signIn(app, env, 'super@kit.local')
    const me = await app.request(
      '/api/me',
      { headers: { cookie: await signIn(app, env, 'super@kit.local') } },
      env,
    )
    const subject = ((await me.json()) as { subject: string }).subject
    const rows = await db.select().from(auditEvents).where(eq(auditEvents.action, 'first_login'))
    const forUser = rows.filter((r) => r.targetId === subject)
    expect(forUser.length).toBe(1)
  })

  it('GET /api/admin/audit-events super_admin only', async () => {
    const { app, env } = await seedEnv()
    const superCookie = await signIn(app, env, 'super@kit.local')
    const staffCookie = await signIn(app, env, 'staff@kit.local')

    const ok = await app.request(
      '/api/admin/audit-events?limit=10',
      { headers: { cookie: superCookie } },
      env,
    )
    expect(ok.status).toBe(200)
    const body = (await ok.json()) as { items: unknown[]; requestId: string }
    expect(Array.isArray(body.items)).toBe(true)
    expect(body.requestId).toMatch(/^req_/)

    const forbidden = await app.request(
      '/api/admin/audit-events',
      { headers: { cookie: staffCookie } },
      env,
    )
    expect(forbidden.status).toBe(403)

    const unauth = await app.request('/api/admin/audit-events', {}, env)
    expect(unauth.status).toBe(401)
  })

  it('appendAudit failure logs action+requestId and returns false', async () => {
    const { db } = await seedEnv()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const insertSpy = vi
      .spyOn(await import('./repos/audit'), 'insertAuditEvent')
      .mockRejectedValue(new Error('insert fail'))
    const ok = await auditService.appendAudit(db, {
      action: 'user.created',
      actorUserId: 'u1',
      targetId: 'u2',
      requestId: 'req_test_audit_fail',
    })
    expect(ok).toBe(false)
    expect(spy).toHaveBeenCalled()
    const logged = String(spy.mock.calls[0]?.[0] ?? '')
    expect(logged).toContain('audit_append_failed')
    expect(logged).toContain('user.created')
    expect(logged).toContain('req_test_audit_fail')
    insertSpy.mockRestore()
    spy.mockRestore()
  })
})
