import { createDb } from '@kit/db'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import { schema } from './db/schema'

import { seedDemoDatabase } from './seed/seed-db'
import { TENANCY_PASSWORD } from './seed/tenancy-data'
import { createMemoryEnv } from './test/memory-env'

const ORIGIN = 'http://localhost:5173'

const BA_ENV = {
  BETTER_AUTH_SECRET: 'test-better-auth-secret-at-least-32!!',
  BETTER_AUTH_URL: 'http://localhost:8787',
  ALLOW_PUBLIC_SIGNUP: 'true',
  ENVIRONMENT: 'test',
  CORS_ORIGINS: ORIGIN,
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

describe('org invitations (B3 S2)', () => {
  it('S3: invite unknown email creates BA user shell + pending invite', async () => {
    const app = createApp()
    const env = createMemoryEnv({
      ...BA_ENV,
      ALLOW_PUBLIC_SIGNUP: 'false',
    })
    const db = createDb(env.DB as unknown as D1Database, schema)
    await seedDemoDatabase(db, { notes: false, environment: 'test' })
    const cookie = await signIn(app, env, 'team-owner@kit.local')
    const res = await app.request(
      '/api/orgs/org_team/invitations',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({ email: 'brand-new@kit.local', role: 'member' }),
      },
      env,
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { invitation: { email: string; status: string } }
    expect(body.invitation.email).toBe('brand-new@kit.local')
    expect(body.invitation.status).toBe('pending')
    const { baUser } = await import('./db/better-auth-schema')
    const { eq } = await import('drizzle-orm')
    const users = await db.select().from(baUser).where(eq(baUser.email, 'brand-new@kit.local'))
    expect(users.length).toBe(1)
    // public signup still off — sign-up should fail
    const signup = await app.request(
      '/api/auth/sign-up/email',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({
          email: 'another-public@kit.local',
          password: TENANCY_PASSWORD,
          name: 'Nope',
        }),
      },
      env,
    )
    expect(signup.status).toBeGreaterThanOrEqual(400)
  })

  it('team-owner invites solo@ as member → pending', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'team-owner@kit.local')
    const res = await app.request(
      '/api/orgs/org_team/invitations',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({ email: 'solo@kit.local', role: 'member' }),
      },
      env,
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      invitation: { id: string; email: string; role: string; status: string }
    }
    expect(body.invitation.email).toBe('solo@kit.local')
    expect(body.invitation.role).toBe('member')
    expect(body.invitation.status).toBe('pending')
    expect(body.invitation.id.startsWith('inv_')).toBe(true)
  })

  it('invitee accepts with matching email → membership', async () => {
    const { app, env } = await seedEnv()
    const ownerCookie = await signIn(app, env, 'team-owner@kit.local')
    const create = await app.request(
      '/api/orgs/org_team/invitations',
      {
        method: 'POST',
        headers: sessionMutation(ownerCookie),
        body: JSON.stringify({ email: 'solo@kit.local', role: 'member' }),
      },
      env,
    )
    expect(create.status).toBe(201)
    const { invitation } = (await create.json()) as { invitation: { id: string } }

    const soloCookie = await signIn(app, env, 'solo@kit.local')
    const accept = await app.request(
      `/api/invitations/${invitation.id}/accept`,
      { method: 'POST', headers: sessionMutation(soloCookie), body: '{}' },
      env,
    )
    expect(accept.status).toBe(200)
    const acc = (await accept.json()) as {
      membership: { role: string; organizationId: string }
      org: { id: string }
    }
    expect(acc.org.id).toBe('org_team')
    expect(acc.membership.role).toBe('member')
    expect(acc.membership.organizationId).toBe('org_team')

    // second accept fails
    const again = await app.request(
      `/api/invitations/${invitation.id}/accept`,
      { method: 'POST', headers: sessionMutation(soloCookie), body: '{}' },
      env,
    )
    expect(again.status).toBe(404)
  })

  it('accept with mismatched email → 403', async () => {
    const { app, env } = await seedEnv()
    const ownerCookie = await signIn(app, env, 'team-owner@kit.local')
    const create = await app.request(
      '/api/orgs/org_team/invitations',
      {
        method: 'POST',
        headers: sessionMutation(ownerCookie),
        body: JSON.stringify({ email: 'solo@kit.local', role: 'reader' }),
      },
      env,
    )
    const { invitation } = (await create.json()) as { invitation: { id: string } }

    const staffCookie = await signIn(app, env, 'staff@kit.local')
    const accept = await app.request(
      `/api/invitations/${invitation.id}/accept`,
      { method: 'POST', headers: sessionMutation(staffCookie), body: '{}' },
      env,
    )
    expect(accept.status).toBe(403)
    const body = (await accept.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('FORBIDDEN')
    expect(body.error.message).toMatch(/email/i)
  })

  it('reader cannot create invite → 403', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'team-reader@kit.local')
    const res = await app.request(
      '/api/orgs/org_team/invitations',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({ email: 'solo@kit.local', role: 'member' }),
      },
      env,
    )
    expect(res.status).toBe(403)
  })

  it('invite owner role → 400', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'team-owner@kit.local')
    const res = await app.request(
      '/api/orgs/org_team/invitations',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({ email: 'solo@kit.local', role: 'owner' }),
      },
      env,
    )
    expect(res.status).toBe(400)
  })

  it('admin cannot invite admin (ceiling) → 400', async () => {
    const { app, env } = await seedEnv()
    // staff is admin on acme
    const cookie = await signIn(app, env, 'staff@kit.local')
    const res = await app.request(
      '/api/orgs/org_acme/invitations',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({ email: 'solo@kit.local', role: 'admin' }),
      },
      env,
    )
    // Phase B assertAssignableRole uses 403 for ceiling (forbidden), not validation 400
    expect(res.status).toBe(403)
  })

  it('cross-org delete invite → 404', async () => {
    const { app, env } = await seedEnv()
    const ownerCookie = await signIn(app, env, 'team-owner@kit.local')
    const create = await app.request(
      '/api/orgs/org_team/invitations',
      {
        method: 'POST',
        headers: sessionMutation(ownerCookie),
        body: JSON.stringify({ email: 'solo@kit.local', role: 'member' }),
      },
      env,
    )
    const { invitation } = (await create.json()) as { invitation: { id: string } }

    // solo owns org_solo but not team invite management
    const soloCookie = await signIn(app, env, 'solo@kit.local')
    const del = await app.request(
      `/api/orgs/org_solo/invitations/${invitation.id}`,
      { method: 'DELETE', headers: sessionMutation(soloCookie) },
      env,
    )
    expect(del.status).toBe(404)
  })

  it('sk_ cannot create or accept invites', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'team-owner@kit.local')
    const mint = await app.request(
      '/api/keys',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({ organizationId: 'org_team' }),
      },
      env,
    )
    expect(mint.status).toBe(200)
    const { key } = (await mint.json()) as { key: string }

    const create = await app.request(
      '/api/orgs/org_team/invitations',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          Origin: ORIGIN,
          'X-Org-Id': 'org_team',
        },
        body: JSON.stringify({ email: 'solo@kit.local', role: 'member' }),
      },
      env,
    )
    expect(create.status).toBe(403)

    // create with session then try accept with sk_
    const okCreate = await app.request(
      '/api/orgs/org_team/invitations',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({ email: 'solo@kit.local', role: 'member' }),
      },
      env,
    )
    const { invitation } = (await okCreate.json()) as { invitation: { id: string } }
    const accept = await app.request(
      `/api/invitations/${invitation.id}/accept`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          Origin: ORIGIN,
        },
        body: '{}',
      },
      env,
    )
    expect(accept.status).toBe(403)
  })

  it('already member → 409 on create', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'team-owner@kit.local')
    const res = await app.request(
      '/api/orgs/org_team/invitations',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({ email: 'team-reader@kit.local', role: 'member' }),
      },
      env,
    )
    expect(res.status).toBe(409)
  })

  it('super_admin without membership cannot create invite', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'super@kit.local')
    const res = await app.request(
      '/api/orgs/org_team/invitations',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({ email: 'solo@kit.local', role: 'member' }),
      },
      env,
    )
    // no membership → requireOrgContext 404 (not break-glass write)
    expect([403, 404]).toContain(res.status)
  })

  it('list pending + cancel works for owner', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'team-owner@kit.local')
    const create = await app.request(
      '/api/orgs/org_team/invitations',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({ email: 'solo@kit.local', role: 'member' }),
      },
      env,
    )
    const { invitation } = (await create.json()) as { invitation: { id: string } }

    const list = await app.request(
      '/api/orgs/org_team/invitations',
      { headers: { cookie, Origin: ORIGIN } },
      env,
    )
    expect(list.status).toBe(200)
    const listed = (await list.json()) as { invitations: { id: string }[] }
    expect(listed.invitations.some((i) => i.id === invitation.id)).toBe(true)

    const del = await app.request(
      `/api/orgs/org_team/invitations/${invitation.id}`,
      { method: 'DELETE', headers: sessionMutation(cookie) },
      env,
    )
    expect(del.status).toBe(200)
  })

  it('BA native invite path remains DENY', async () => {
    const { app, env } = await seedEnv()
    const cookie = await signIn(app, env, 'team-owner@kit.local')
    const res = await app.request(
      '/api/auth/organization/invite-member',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({ email: 'x@y.z', role: 'member' }),
      },
      env,
    )
    expect(res.status).toBe(404)
  })
})
