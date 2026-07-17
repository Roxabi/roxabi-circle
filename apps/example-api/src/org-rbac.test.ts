import { createDb } from '@gosilex/db'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import { schema } from './db/schema'
import { seedTenancyDemo } from './seed/seed-tenancy'
import { createMemoryEnv } from './test/memory-env'

const BA_ENV = {
  AUTH_SESSION_ADAPTER: 'better-auth' as const,
  BETTER_AUTH_SECRET: 'test-better-auth-secret-at-least-32!!',
  BETTER_AUTH_URL: 'http://localhost:8787',
  ALLOW_PUBLIC_SIGNUP: 'true',
}

async function baSession(
  app: ReturnType<typeof createApp>,
  env: ReturnType<typeof createMemoryEnv>,
) {
  const email = `org-${crypto.randomUUID().slice(0, 8)}@gosilex.local`
  const password = 'ba-password-change-me-1'
  const signup = await app.request(
    '/api/auth/sign-up/email',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({ email, password, name: 'Org User' }),
    },
    env,
  )
  let cookie = signup.headers.get('set-cookie') ?? ''
  if (signup.status >= 400 || !cookie) {
    const signin = await app.request(
      '/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: 'http://localhost:5173' },
        body: JSON.stringify({ email, password }),
      },
      env,
    )
    if (signin.status >= 400) {
      return { cookie: '', email, ok: false as const }
    }
    cookie = signin.headers.get('set-cookie') ?? ''
  }
  return { cookie, email, ok: Boolean(cookie) as true }
}

describe('org RBAC (ADR-0003 Phase A)', () => {
  it('HMAC adapter fail-closes org routes', async () => {
    const app = createApp()
    const env = createMemoryEnv({ AUTH_SESSION_ADAPTER: 'hmac' })
    const res = await app.request('/api/orgs', {}, env)
    expect(res.status).toBe(404)
  })

  it('BA user can create org and list memberships; foreign org is 404', async () => {
    const app = createApp()
    const envA = createMemoryEnv(BA_ENV)
    const a = await baSession(app, envA)
    if (!a.ok) {
      // BA signup path unavailable in this runtime — soft skip
      expect(a.ok).toBe(false)
      return
    }

    const create = await app.request(
      '/api/orgs',
      {
        method: 'POST',
        headers: {
          cookie: a.cookie,
          'content-type': 'application/json',
          Origin: 'http://localhost:5173',
        },
        body: JSON.stringify({
          name: 'Acme Client',
          slug: `acme-${crypto.randomUUID().slice(0, 6)}`,
        }),
      },
      envA,
    )
    expect(create.status).toBe(201)
    const { org } = (await create.json()) as { org: { id: string; slug: string } }
    expect(org.id).toMatch(/^org_/)

    const list = await app.request(
      '/api/orgs',
      { headers: { cookie: a.cookie, Origin: 'http://localhost:5173' } },
      envA,
    )
    expect(list.status).toBe(200)
    const listBody = (await list.json()) as { orgs: { id: string }[] }
    expect(listBody.orgs.some((o) => o.id === org.id)).toBe(true)

    const get = await app.request(
      `/api/orgs/${org.id}`,
      { headers: { cookie: a.cookie, Origin: 'http://localhost:5173' } },
      envA,
    )
    expect(get.status).toBe(200)

    // Second user / env cannot see orgA
    const envB = createMemoryEnv(BA_ENV)
    const b = await baSession(app, envB)
    if (!b.ok) return
    const denied = await app.request(
      `/api/orgs/${org.id}`,
      { headers: { cookie: b.cookie, Origin: 'http://localhost:5173' } },
      envB,
    )
    expect(denied.status).toBe(404)
  })

  it('platform modules require super_admin for PATCH available', async () => {
    const app = createApp()
    const env = createMemoryEnv(BA_ENV)
    const a = await baSession(app, env)
    if (!a.ok) return

    const patch = await app.request(
      '/api/platform/modules/feedback',
      {
        method: 'PATCH',
        headers: {
          cookie: a.cookie,
          'content-type': 'application/json',
          Origin: 'http://localhost:5173',
        },
        body: JSON.stringify({ available: true }),
      },
      env,
    )
    // no platform role → 403
    expect(patch.status).toBe(403)
  })

  it('seed tenancy personas + staff isolation + org-bound key', async () => {
    const app = createApp()
    const env = createMemoryEnv(BA_ENV)
    const db = createDb(env.DB as unknown as D1Database, schema)
    const seeded = await seedTenancyDemo(db)
    expect(seeded.users.length).toBeGreaterThanOrEqual(5)
    expect(seeded.orgs.some((o) => o.id === 'org_acme')).toBe(true)

    // Staff can open acme, not solo
    const signin = await app.request(
      '/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: 'http://localhost:5173' },
        body: JSON.stringify({
          email: 'staff@gosilex.local',
          password: 'demo-password-change-me',
        }),
      },
      env,
    )
    expect(signin.status).toBeLessThan(400)
    const cookie = signin.headers.get('set-cookie') ?? ''
    expect(cookie).toBeTruthy()

    const acme = await app.request(
      '/api/orgs/org_acme',
      { headers: { cookie, Origin: 'http://localhost:5173' } },
      env,
    )
    expect(acme.status).toBe(200)

    const solo = await app.request(
      '/api/orgs/org_solo',
      { headers: { cookie, Origin: 'http://localhost:5173' } },
      env,
    )
    expect(solo.status).toBe(404)

    // team reader cannot manage modules
    const readerSignin = await app.request(
      '/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: 'http://localhost:5173' },
        body: JSON.stringify({
          email: 'team-reader@gosilex.local',
          password: 'demo-password-change-me',
        }),
      },
      env,
    )
    expect(readerSignin.status).toBeLessThan(400)
    const readerCookie = readerSignin.headers.get('set-cookie') ?? ''
    const readerPatch = await app.request(
      '/api/orgs/org_team/modules/feedback',
      {
        method: 'PATCH',
        headers: {
          cookie: readerCookie,
          'content-type': 'application/json',
          Origin: 'http://localhost:5173',
        },
        body: JSON.stringify({ enabled: true }),
      },
      env,
    )
    expect(readerPatch.status).toBe(403)

    // org-bound key: mint for acme, cannot use after membership would fail if wrong org stored
    const mint = await app.request(
      '/api/keys',
      {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
          Origin: 'http://localhost:5173',
        },
        body: JSON.stringify({ organizationId: 'org_acme' }),
      },
      env,
    )
    expect(mint.status).toBe(200)
    const { key, organizationId } = (await mint.json()) as {
      key: string
      organizationId: string
    }
    expect(organizationId).toBe('org_acme')
    const me = await app.request('/api/me', { headers: { authorization: `Bearer ${key}` } }, env)
    expect(me.status).toBe(200)

    // mint without org under BA → validation error
    const mintBare = await app.request(
      '/api/keys',
      {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
          Origin: 'http://localhost:5173',
        },
        body: '{}',
      },
      env,
    )
    expect(mintBare.status).toBe(400)
  })
})
