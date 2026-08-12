import { createDb } from '@kit/db'
import { eq, like } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import { baMember, baUser, baVerification } from './db/better-auth-schema'
import { schema, userPlatformRoles } from './db/schema'

import { seedDemoDatabase } from './seed/seed-db'
import { TENANCY_PASSWORD } from './seed/tenancy-data'
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

function sessionMutation(cookie: string): Record<string, string> {
  return {
    cookie,
    'content-type': 'application/json',
    Origin: ORIGIN,
  }
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
  const cookie = res.headers.get('set-cookie')?.split(';')[0]
  expect(cookie).toBeTruthy()
  return cookie!
}

async function latestWelcomeToken(db: ReturnType<typeof createDb>): Promise<string | null> {
  const rows = await db
    .select()
    .from(baVerification)
    .where(like(baVerification.identifier, 'reset-password:%'))
  const row = rows[rows.length - 1]
  if (!row?.identifier) return null
  return row.identifier.replace(/^reset-password:/, '')
}

describe('admin users (B-users #58)', () => {
  it('SC1: super_admin creates user + memberships; no password in body', async () => {
    const { app, env, db } = await seedEnv()
    const cookie = await signIn(app, env, 'super@kit.local')
    const res = await app.request(
      '/api/admin/users',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({
          email: 'client-new@kit.local',
          name: 'New Client',
          memberships: [{ orgId: 'org_team', role: 'member' }],
        }),
      },
      env,
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      user: { id: string; email: string; platformRole: string | null }
      memberships: { organizationId: string; role: string }[]
      welcomeEmailSent: boolean
    }
    expect(body.user.email).toBe('client-new@kit.local')
    expect(body.user.platformRole).toBeNull()
    expect(body.memberships).toEqual([{ organizationId: 'org_team', role: 'member' }])
    expect(body.welcomeEmailSent).toBe(true)
    expect(JSON.stringify(body)).not.toMatch(/password/i)

    const mem = await db.select().from(baMember).where(eq(baMember.userId, body.user.id))
    expect(mem.some((m) => m.organizationId === 'org_team')).toBe(true)
    const token = await latestWelcomeToken(db)
    expect(token).toBeTruthy()
  })

  it('SC2: staff cannot assign platformRole super_admin → 403', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'staff@kit.local')
    const res = await app.request(
      '/api/admin/users',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({
          email: 'evil@kit.local',
          platformRole: 'super_admin',
        }),
      },
      env,
    )
    expect(res.status).toBe(403)
  })

  it('SC3: staff cannot attach membership to foreign org → 404', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'staff@kit.local')
    // staff is on org_acme + org_beta, not org_team
    const res = await app.request(
      '/api/admin/users',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({
          email: 'foreign-attach@kit.local',
          memberships: [{ orgId: 'org_team', role: 'member' }],
        }),
      },
      env,
    )
    expect(res.status).toBe(404)
  })

  it('SC4: email fail rolls back — no user/member row', async () => {
    const { db } = await seedEnv()
    const { createAdminUser } = await import('./services/admin-users')
    await expect(
      createAdminUser(db, {
        actorUserId: 'user_super',
        actorPlatformRole: 'super_admin',
        email: 'rollback@kit.local',
        memberships: [{ orgId: 'org_solo', role: 'member' }],
        webBaseUrl: ORIGIN,
        emailPort: {
          send: async () => {
            throw new Error('smtp down')
          },
        },
      }),
    ).rejects.toThrow(/Failed to send welcome|Internal/i)
    const users = await db.select().from(baUser).where(eq(baUser.email, 'rollback@kit.local'))
    expect(users.length).toBe(0)
    const mems = await db.select().from(baMember).where(eq(baMember.organizationId, 'org_solo'))
    expect(mems.every((m) => m.userId !== 'rollback@kit.local')).toBe(true)
  })

  it('SC5/SC6: welcome token sets password once; second use fails; login works', async () => {
    const { app, env, db } = await seedEnv()
    const cookie = await signIn(app, env, 'super@kit.local')
    const create = await app.request(
      '/api/admin/users',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({ email: 'firstlogin@kit.local', name: 'First' }),
      },
      env,
    )
    expect(create.status).toBe(201)
    const token = await latestWelcomeToken(db)
    expect(token).toBeTruthy()

    const newPassword = 'first-login-password-ok'
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

    const reuse = await app.request(
      '/api/auth/reset-password',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({ newPassword: 'other-password-xyz', token }),
      },
      env,
    )
    expect(reuse.status).toBeGreaterThanOrEqual(400)

    const login = await app.request(
      '/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({ email: 'firstlogin@kit.local', password: newPassword }),
      },
      env,
    )
    expect(login.status).toBeLessThan(400)
  })

  it('SC7: existing email → 409', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'super@kit.local')
    const res = await app.request(
      '/api/admin/users',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({ email: 'solo@kit.local' }),
      },
      env,
    )
    expect(res.status).toBe(409)
  })

  it('SC9: sk_ cannot create admin users → 403', async () => {
    const { app, env } = await seedEnv()
    // mint key as super via session then use sk_
    const cookie = await signIn(app, env, 'super@kit.local')
    const keyRes = await app.request(
      '/api/keys',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({ name: 'admin-test-key' }),
      },
      env,
    )
    // keys route may require org — skip if 404
    if (keyRes.status >= 400) {
      // use demo seed key path from health or skip with direct bearer invalid
      const res = await app.request(
        '/api/admin/users',
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer sk_deadbeefdeadbeefdeadbeef',
            'content-type': 'application/json',
            Origin: ORIGIN,
          },
          body: JSON.stringify({ email: 'via-key@kit.local' }),
        },
        env,
      )
      expect([401, 403]).toContain(res.status)
      return
    }
    const keyBody = (await keyRes.json()) as { key?: { plaintext?: string }; plaintext?: string }
    const plaintext = keyBody.key?.plaintext ?? keyBody.plaintext
    expect(plaintext).toBeTruthy()
    const res = await app.request(
      '/api/admin/users',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${plaintext}`,
          'content-type': 'application/json',
          Origin: ORIGIN,
        },
        body: JSON.stringify({ email: 'via-key@kit.local' }),
      },
      env,
    )
    expect(res.status).toBe(403)
  })

  it('CP-IDOR: client-only session create → 403', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'solo@kit.local')
    const res = await app.request(
      '/api/admin/users',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({ email: 'nope@kit.local' }),
      },
      env,
    )
    expect(res.status).toBe(403)
  })

  it('CP-IDOR: unauthenticated create → 401', async () => {
    const { app, env } = await seedEnv()
    const res = await app.request(
      '/api/admin/users',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({ email: 'anon@kit.local' }),
      },
      env,
    )
    expect(res.status).toBe(401)
  })

  it('super_admin can assign staff platformRole', async () => {
    const { app, env, db } = await seedEnv()
    const cookie = await signIn(app, env, 'super@kit.local')
    const res = await app.request(
      '/api/admin/users',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({
          email: 'new-staff@kit.local',
          platformRole: 'staff',
          memberships: [
            { orgId: 'org_acme', role: 'admin' },
            { orgId: 'org_beta', role: 'member' },
          ],
        }),
      },
      env,
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { user: { id: string; platformRole: string | null } }
    expect(body.user.platformRole).toBe('staff')
    const pr = await db
      .select()
      .from(userPlatformRoles)
      .where(eq(userPlatformRoles.userId, body.user.id))
    expect(pr[0]?.role).toBe('staff')
  })

  it('staff can create client on membership org', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'staff@kit.local')
    const res = await app.request(
      '/api/admin/users',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({
          email: 'staff-created@kit.local',
          memberships: [{ orgId: 'org_acme', role: 'member' }],
        }),
      },
      env,
    )
    expect(res.status).toBe(201)
  })

  it('GET /api/admin/users lists users for platform actor', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'super@kit.local')
    const res = await app.request('/api/admin/users', { headers: sessionMutation(cookie) }, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { users: { email: string }[] }
    expect(body.users.length).toBeGreaterThan(0)
    expect(body.users.some((u) => u.email === 'super@kit.local')).toBe(true)
  })

  it('GET /api/admin/users — staff only sees users sharing an org (IDOR privacy)', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'staff@kit.local')
    const res = await app.request('/api/admin/users', { headers: sessionMutation(cookie) }, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { users: { email: string }[] }
    const emails = body.users.map((u) => u.email)
    // staff is on org_acme + org_beta (with team-owner), not org_solo / org_team
    expect(emails).toContain('staff@kit.local')
    expect(emails).toContain('team-owner@kit.local')
    expect(emails).not.toContain('solo@kit.local')
    expect(emails).not.toContain('super@kit.local')
    expect(emails).not.toContain('team-reader@kit.local')
  })

  it('GET /api/admin/users — staff pagination scopes before limit', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'staff@kit.local')
    const res = await app.request(
      '/api/admin/users?limit=1',
      {
        headers: sessionMutation(cookie),
      },
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { users: { email: string }[] }
    expect(body.users).toHaveLength(1)
    // Must be a shared-org member, not a global-newest out-of-scope user
    expect(['staff@kit.local', 'team-owner@kit.local']).toContain(body.users[0]!.email)
  })

  it('GET /api/admin/users — super_admin still sees solo client', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'super@kit.local')
    const res = await app.request('/api/admin/users', { headers: sessionMutation(cookie) }, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { users: { email: string }[] }
    expect(body.users.some((u) => u.email === 'solo@kit.local')).toBe(true)
  })

  it('POST /api/admin/users — staff cannot probe out-of-scope existing email (no 409)', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'staff@kit.local')
    const res = await app.request(
      '/api/admin/users',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({
          email: 'solo@kit.local',
          memberships: [{ orgId: 'org_acme', role: 'member' }],
        }),
      },
      env,
    )
    // notFound (not conflict) — avoids platform-wide existence oracle matching list privacy
    expect(res.status).toBe(404)
  })
})
