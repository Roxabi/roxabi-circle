/**
 * ADR-0003 Phase B — custom roles + grants + IDOR matrix (CP-IDOR ≥ 8).
 * Spark #127 · GH #22
 */
import { createDb } from '@gosilex/db'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
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
  return res.headers.get('set-cookie') ?? ''
}

async function seedEnv() {
  const app = createApp()
  const env = createMemoryEnv(BA_ENV)
  const db = createDb(env.DB as unknown as D1Database, schema)
  await seedTenancyDemo(db, { environment: 'test', force: true })
  return { app, env, db }
}

describe('org roles Phase B — IDOR + grants', () => {
  it('1 roles list requires auth', async () => {
    const app = createApp()
    const env = createMemoryEnv(BA_ENV)
    const res = await app.request('/api/orgs/org_team/roles', {}, env)
    expect(res.status).toBe(401)
  })

  it('2 owner lists seeded system roles', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'team-owner@gosilex.local')
    const res = await app.request(
      '/api/orgs/org_team/roles',
      { headers: { cookie, Origin: ORIGIN } },
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      roles: Array<{ key: string; isSystem: boolean; grants: unknown[] }>
    }
    const keys = body.roles.map((r) => r.key).sort()
    expect(keys).toEqual(['admin', 'member', 'owner', 'reader'])
    expect(body.roles.every((r) => r.isSystem)).toBe(true)
    expect(body.roles.find((r) => r.key === 'reader')?.grants.length).toBeGreaterThan(0)
  })

  it('3 cross-org IDOR: acme staff cannot list team roles', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'staff@gosilex.local')
    const res = await app.request(
      '/api/orgs/org_team/roles',
      { headers: { cookie, Origin: ORIGIN } },
      env,
    )
    expect(res.status).toBe(404)
  })

  it('4 reader cannot create custom role (403)', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'team-reader@gosilex.local')
    const res = await app.request(
      '/api/orgs/org_team/roles',
      {
        method: 'POST',
        headers: { cookie, Origin: ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'viewer_plus', name: 'Viewer+' }),
      },
      env,
    )
    expect(res.status).toBe(403)
  })

  it('5 owner creates custom role with read grant', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'team-owner@gosilex.local')
    const res = await app.request(
      '/api/orgs/org_team/roles',
      {
        method: 'POST',
        headers: { cookie, Origin: ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({
          key: 'analyst',
          name: 'Analyst',
          grants: [{ moduleId: 'feedback', access: 'read' }],
        }),
      },
      env,
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { role: { key: string; isSystem: boolean } }
    expect(body.role.key).toBe('analyst')
    expect(body.role.isSystem).toBe(false)
  })

  it('6 system role grants are immutable', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'team-owner@gosilex.local')
    const list = await app.request(
      '/api/orgs/org_team/roles',
      { headers: { cookie, Origin: ORIGIN } },
      env,
    )
    const roles = ((await list.json()) as { roles: Array<{ id: string; key: string }> }).roles
    const reader = roles.find((r) => r.key === 'reader')!
    const res = await app.request(
      `/api/orgs/org_team/roles/${reader.id}/grants/feedback`,
      {
        method: 'PATCH',
        headers: { cookie, Origin: ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({ access: 'write' }),
      },
      env,
    )
    expect(res.status).toBe(403)
  })

  it('7 cannot patch grants on other org role id', async () => {
    const { app, env } = await seedEnv()
    const ownerTeam = await signIn(app, env, 'team-owner@gosilex.local')
    const create = await app.request(
      '/api/orgs/org_team/roles',
      {
        method: 'POST',
        headers: {
          cookie: ownerTeam,
          Origin: ORIGIN,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          key: 'temp_role',
          name: 'Temp',
          grants: [{ moduleId: 'feedback', access: 'read' }],
        }),
      },
      env,
    )
    expect(create.status).toBe(201)
    const roleId = ((await create.json()) as { role: { id: string } }).role.id

    const solo = await signIn(app, env, 'solo@gosilex.local')
    const res = await app.request(
      `/api/orgs/org_solo/roles/${roleId}/grants/feedback`,
      {
        method: 'PATCH',
        headers: { cookie: solo, Origin: ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({ access: 'write' }),
      },
      env,
    )
    expect(res.status).toBe(404)
  })

  it('8 cannot delete system role', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'team-owner@gosilex.local')
    const list = await app.request(
      '/api/orgs/org_team/roles',
      { headers: { cookie, Origin: ORIGIN } },
      env,
    )
    const ownerRole = (
      (await list.json()) as { roles: Array<{ id: string; key: string }> }
    ).roles.find((r) => r.key === 'owner')!
    const res = await app.request(
      `/api/orgs/org_team/roles/${ownerRole.id}`,
      {
        method: 'DELETE',
        headers: { cookie, Origin: ORIGIN },
      },
      env,
    )
    expect(res.status).toBe(403)
  })

  it('9 super_admin write on roles routes is denied without membership', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'super@gosilex.local')
    const res = await app.request(
      '/api/orgs/org_team/roles',
      {
        method: 'POST',
        headers: { cookie, Origin: ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'x', name: 'X' }),
      },
      env,
    )
    // super without membership + write → break-glass off → 403 or 404
    expect([403, 404]).toContain(res.status)
  })

  it('10 create role rejects system key reuse', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'team-owner@gosilex.local')
    const res = await app.request(
      '/api/orgs/org_team/roles',
      {
        method: 'POST',
        headers: { cookie, Origin: ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'admin', name: 'Fake Admin' }),
      },
      env,
    )
    expect(res.status).toBe(400)
  })
})
