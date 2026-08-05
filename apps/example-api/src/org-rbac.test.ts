import { createDb } from '@kit/db'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import { baMember, baOrganization } from './db/better-auth-schema'
import { schema } from './db/schema'
import { seedTenancyDemo } from './seed/seed-tenancy'
import { createMemoryEnv } from './test/memory-env'

const BA_ENV = {
  BETTER_AUTH_SECRET: 'test-better-auth-secret-at-least-32!!',
  BETTER_AUTH_URL: 'http://localhost:8787',
  ALLOW_PUBLIC_SIGNUP: 'true',
  ENVIRONMENT: 'test',
}

const ORIGIN = 'http://localhost:5173'

async function signIn(
  app: ReturnType<typeof createApp>,
  env: ReturnType<typeof createMemoryEnv>,
  email: string,
  password = 'demo-password-change-me',
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
  const cookie = res.headers.get('set-cookie') ?? ''
  expect(cookie, `cookie for ${email}`).toBeTruthy()
  return cookie
}

async function seedEnv() {
  const app = createApp()
  const env = createMemoryEnv(BA_ENV)
  const db = createDb(env.DB as unknown as D1Database, schema)
  await seedTenancyDemo(db, { environment: 'test', force: true })
  return { app, env, db }
}

describe('org RBAC (ADR-0003 Phase A) — IDOR matrix', () => {
  it('org routes require auth (no anonymous list)', async () => {
    const app = createApp()
    const env = createMemoryEnv(BA_ENV)
    const res = await app.request('/api/orgs', {}, env)
    expect(res.status).toBe(401)
  })

  it('BA org mutation paths are denied (Phase A seed-only)', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'staff@kit.local')
    const res = await app.request(
      '/api/auth/organization/create',
      {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
          Origin: ORIGIN,
        },
        body: JSON.stringify({ name: 'Evil', slug: 'evil' }),
      },
      env,
    )
    expect(res.status).toBe(404)
  })

  it('staff can open acme membership org', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'staff@kit.local')
    const res = await app.request(
      '/api/orgs/org_acme',
      { headers: { cookie, Origin: ORIGIN } },
      env,
    )
    expect(res.status).toBe(200)
  })

  it('staff without membership gets 404 on solo org', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'staff@kit.local')
    const res = await app.request(
      '/api/orgs/org_solo',
      { headers: { cookie, Origin: ORIGIN } },
      env,
    )
    expect(res.status).toBe(404)
  })

  it('team reader cannot PATCH org modules', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'team-reader@kit.local')
    const res = await app.request(
      '/api/orgs/org_team/modules/feedback',
      {
        method: 'PATCH',
        headers: {
          cookie,
          'content-type': 'application/json',
          Origin: ORIGIN,
        },
        body: JSON.stringify({ enabled: true }),
      },
      env,
    )
    expect(res.status).toBe(403)
  })

  it('non-super platform PATCH modules is 403', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'staff@kit.local')
    const res = await app.request(
      '/api/platform/modules/feedback',
      {
        method: 'PATCH',
        headers: {
          cookie,
          'content-type': 'application/json',
          Origin: ORIGIN,
        },
        body: JSON.stringify({ available: true }),
      },
      env,
    )
    expect(res.status).toBe(403)
  })

  it('path vs X-Org-Id mismatch returns 403', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'staff@kit.local')
    const res = await app.request(
      '/api/orgs/org_acme',
      {
        headers: {
          cookie,
          Origin: ORIGIN,
          'X-Org-Id': 'org_beta',
        },
      },
      env,
    )
    expect(res.status).toBe(403)
  })

  it('BA mint requires organizationId', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'staff@kit.local')
    const res = await app.request(
      '/api/keys',
      {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
          Origin: ORIGIN,
        },
        body: '{}',
      },
      env,
    )
    expect(res.status).toBe(400)
  })

  it('mint for non-member org is forbidden', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'staff@kit.local')
    const res = await app.request(
      '/api/keys',
      {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
          Origin: ORIGIN,
        },
        body: JSON.stringify({ organizationId: 'org_solo' }),
      },
      env,
    )
    expect(res.status).toBe(403)
  })

  it('org-bound key cannot hop to another membership org', async () => {
    const { app, env, db } = await seedEnv()
    const cookie = await signIn(app, env, 'staff@kit.local')
    const mint = await app.request(
      '/api/keys',
      {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
          Origin: ORIGIN,
        },
        body: JSON.stringify({ organizationId: 'org_acme' }),
      },
      env,
    )
    expect(mint.status).toBe(200)
    const { key } = (await mint.json()) as { key: string }

    // positive control: key works on its org
    const okAcme = await app.request(
      '/api/orgs/org_acme',
      { headers: { authorization: `Bearer ${key}`, Origin: ORIGIN } },
      env,
    )
    expect(okAcme.status).toBe(200)

    // staff is also member of beta — key must not authorize beta routes
    const hop = await app.request(
      '/api/orgs/org_beta',
      {
        headers: {
          authorization: `Bearer ${key}`,
          Origin: ORIGIN,
        },
      },
      env,
    )
    expect(hop.status).toBe(403)

    // membership removed → key dead
    await db.delete(baMember).where(eq(baMember.id, 'mem_org_acme_user_staff'))
    const dead = await app.request('/api/me', { headers: { authorization: `Bearer ${key}` } }, env)
    expect(dead.status).toBe(401)
  })

  it('suspended org is denied', async () => {
    const { app, env, db } = await seedEnv()
    await db
      .update(baOrganization)
      .set({ status: 'suspended' })
      .where(eq(baOrganization.id, 'org_acme'))
    const cookie = await signIn(app, env, 'staff@kit.local')
    const res = await app.request(
      '/api/orgs/org_acme',
      { headers: { cookie, Origin: ORIGIN } },
      env,
    )
    expect(res.status).toBe(403)
  })

  it('super_admin cannot write tenant modules without break-glass', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'super@kit.local')
    // super is not a member of org_solo; write default off → 404 (no membership leak path)
    const res = await app.request(
      '/api/orgs/org_solo/modules/feedback',
      {
        method: 'PATCH',
        headers: {
          cookie,
          'content-type': 'application/json',
          Origin: ORIGIN,
        },
        body: JSON.stringify({ enabled: true }),
      },
      env,
    )
    expect(res.status).toBe(404)
  })

  it('super_admin can read foreign org with allowSuperAdmin route', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'super@kit.local')
    // GET /api/orgs/:id uses allowSuperAdmin: true
    const res = await app.request(
      '/api/orgs/org_solo',
      { headers: { cookie, Origin: ORIGIN } },
      env,
    )
    expect(res.status).toBe(200)
  })

  it('team owner can list own org members', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'team-owner@kit.local')
    const res = await app.request(
      '/api/orgs/org_team/members',
      { headers: { cookie, Origin: ORIGIN } },
      env,
    )
    expect(res.status).toBe(200)
  })

  it('super_admin can list platform modules; staff can list too', async () => {
    const { app, env } = await seedEnv()
    const superCookie = await signIn(app, env, 'super@kit.local')
    const staffCookie = await signIn(app, env, 'staff@kit.local')
    const s = await app.request(
      '/api/platform/modules',
      { headers: { cookie: superCookie, Origin: ORIGIN } },
      env,
    )
    expect(s.status).toBe(200)
    const st = await app.request(
      '/api/platform/modules',
      { headers: { cookie: staffCookie, Origin: ORIGIN } },
      env,
    )
    expect(st.status).toBe(200)
  })

  it('team owner can GET org modules effective shape', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'team-owner@kit.local')
    const res = await app.request(
      '/api/orgs/org_team/modules',
      { headers: { cookie, Origin: ORIGIN } },
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      modules: { feedback: { available: boolean; effective: boolean } }
    }
    expect(body.modules.feedback).toHaveProperty('available')
    expect(body.modules.feedback).toHaveProperty('effective')
  })

  it('key list includes organizationId; org list scoped for bound key', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'staff@kit.local')
    const mint = await app.request(
      '/api/keys',
      {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
          Origin: ORIGIN,
        },
        body: JSON.stringify({ organizationId: 'org_acme', name: 'acme-bot' }),
      },
      env,
    )
    expect(mint.status).toBe(200)
    const { key } = (await mint.json()) as { key: string }
    const list = await app.request('/api/keys', { headers: { cookie, Origin: ORIGIN } }, env)
    expect(list.status).toBe(200)
    const listBody = (await list.json()) as {
      keys: { organizationId: string | null; name: string | null }[]
    }
    expect(listBody.keys.some((k) => k.organizationId === 'org_acme')).toBe(true)

    const orgs = await app.request(
      '/api/orgs',
      { headers: { authorization: `Bearer ${key}`, Origin: ORIGIN } },
      env,
    )
    expect(orgs.status).toBe(200)
    const orgsBody = (await orgs.json()) as { orgs: { id: string }[] }
    expect(orgsBody.orgs.every((o) => o.id === 'org_acme')).toBe(true)
  })
})
