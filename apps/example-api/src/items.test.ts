import { createDb } from '@kit/db'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import { schema } from './db/schema'
import { DEMO_EMAIL, DEMO_EMAIL_B, DEMO_PASSWORD, DEMO_PASSWORD_B } from './seed/demo-data'
import { seedDemoDatabase } from './seed/seed-db'
import { TENANCY_PASSWORD } from './seed/tenancy-data'
import { createMemoryEnv } from './test/memory-env'

const ORIGIN = 'http://localhost:5173'

function sessionMutation(cookie: string): Record<string, string> {
  return {
    cookie,
    'content-type': 'application/json',
    Origin: ORIGIN,
  }
}

function sessionMutationOrg(cookie: string, orgId: string): Record<string, string> {
  return { ...sessionMutation(cookie), 'X-Org-Id': orgId }
}

async function loginAs(
  app: ReturnType<typeof createApp>,
  env: ReturnType<typeof createMemoryEnv>,
  email: string,
  password: string,
) {
  const db = createDb(env.DB as unknown as D1Database, schema)
  await seedDemoDatabase(db, { notes: true, environment: 'test' })
  const login = await app.request(
    '/api/auth/sign-in/email',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ email, password }),
    },
    env,
  )
  expect(login.status, `sign-in ${email}`).toBeLessThan(400)
  const setCookie = login.headers.get('set-cookie')
  expect(setCookie).toBeTruthy()
  return setCookie!.split(';')[0]!
}

describe('MasterData demo_items API', () => {
  it('requires auth', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const res = await app.request('/api/items', {}, env)
    expect(res.status).toBe(401)
  })

  it('CRUD + IDOR isolation + conflict on code', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const staffCookie = await loginAs(app, env, 'staff@kit.local', TENANCY_PASSWORD)
    const cookieA = await loginAs(app, env, DEMO_EMAIL, DEMO_PASSWORD)
    const cookieB = await loginAs(app, env, DEMO_EMAIL_B, DEMO_PASSWORD_B)

    const create = await app.request(
      '/api/items',
      {
        method: 'POST',
        headers: sessionMutationOrg(staffCookie, 'org_acme'),
        body: JSON.stringify({
          code: 'sku-alpha',
          label: 'Alpha item',
          description: 'demo catalog',
        }),
      },
      env,
    )
    expect(create.status).toBe(201)
    const created = (await create.json()) as { item: { id: string; code: string } }
    expect(created.item.code).toBe('sku-alpha')
    const id = created.item.id

    const dup = await app.request(
      '/api/items',
      {
        method: 'POST',
        headers: sessionMutationOrg(staffCookie, 'org_acme'),
        body: JSON.stringify({ code: 'sku-alpha', label: 'Dup' }),
      },
      env,
    )
    expect(dup.status).toBe(409)
    const dupBody = (await dup.json()) as { error: { code: string } }
    expect(dupBody.error.code).toBe('CONFLICT')

    const listA = await app.request('/api/items', { headers: { cookie: staffCookie } }, env)
    expect(listA.status).toBe(200)
    const listed = (await listA.json()) as { items: { id: string }[] }
    expect(listed.items.some((i) => i.id === id)).toBe(true)

    const idorGetA = await app.request(`/api/items/${id}`, { headers: { cookie: cookieA } }, env)
    expect(idorGetA.status).toBe(404)
    const idorGet = await app.request(`/api/items/${id}`, { headers: { cookie: cookieB } }, env)
    expect(idorGet.status).toBe(404)

    // Two write-capable members of org_acme: grant passes; subject WHERE must still 404.
    const ownerCookie = await loginAs(app, env, 'team-owner@kit.local', TENANCY_PASSWORD)
    const idorPatch = await app.request(
      `/api/items/${id}`,
      {
        method: 'PATCH',
        headers: sessionMutationOrg(ownerCookie, 'org_acme'),
        body: JSON.stringify({ label: 'Hacked' }),
      },
      env,
    )
    expect(idorPatch.status).toBe(404)

    const idorDel = await app.request(
      `/api/items/${id}`,
      { method: 'DELETE', headers: sessionMutationOrg(ownerCookie, 'org_acme') },
      env,
    )
    expect(idorDel.status).toBe(404)

    const stillStaff = await app.request(
      `/api/items/${id}`,
      { headers: { cookie: staffCookie } },
      env,
    )
    expect(stillStaff.status).toBe(200)
    const kept = (await stillStaff.json()) as { item: { label: string } }
    expect(kept.item.label).toBe('Alpha item')

    const patch = await app.request(
      `/api/items/${id}`,
      {
        method: 'PATCH',
        headers: sessionMutationOrg(staffCookie, 'org_acme'),
        body: JSON.stringify({ label: 'Alpha v2', active: false }),
      },
      env,
    )
    expect(patch.status).toBe(200)
    const patched = (await patch.json()) as { item: { label: string; active: boolean } }
    expect(patched.item.label).toBe('Alpha v2')
    expect(patched.item.active).toBe(false)

    const filtered = await app.request(
      '/api/items?q=Alpha',
      { headers: { cookie: staffCookie } },
      env,
    )
    expect(filtered.status).toBe(200)
    const fbody = (await filtered.json()) as { items: { id: string }[] }
    expect(fbody.items.some((i) => i.id === id)).toBe(true)

    const del = await app.request(
      `/api/items/${id}`,
      { method: 'DELETE', headers: sessionMutationOrg(staffCookie, 'org_acme') },
      env,
    )
    expect(del.status).toBe(200)
    const gone = await app.request(`/api/items/${id}`, { headers: { cookie: staffCookie } }, env)
    expect(gone.status).toBe(404)
  })
})

describe('demo_items write grant (ADR-0003)', () => {
  it('returns 403 FORBIDDEN and inserts zero rows when team-reader POSTs LEAK with X-Org-Id org_team', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const cookie = await loginAs(app, env, 'team-reader@kit.local', TENANCY_PASSWORD)

    const create = await app.request(
      '/api/items',
      {
        method: 'POST',
        headers: sessionMutationOrg(cookie, 'org_team'),
        body: JSON.stringify({ code: 'LEAK', label: 'should fail' }),
      },
      env,
    )
    expect(create.status).toBe(403)
    const body = (await create.json()) as { error: { code: string } }
    expect(body.error.code).toBe('FORBIDDEN')

    const list = await app.request('/api/items', { headers: { cookie } }, env)
    expect(list.status).toBe(200)
    const listed = (await list.json()) as { items: { code: string }[] }
    expect(listed.items.some((i) => i.code === 'LEAK')).toBe(false)
  })

  it('returns 403 FORBIDDEN when team-reader PATCH/DELETE a staff-created row with X-Org-Id org_team', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const staffCookie = await loginAs(app, env, 'staff@kit.local', TENANCY_PASSWORD)
    const created = await app.request(
      '/api/items',
      {
        method: 'POST',
        headers: sessionMutationOrg(staffCookie, 'org_acme'),
        body: JSON.stringify({ code: 'acme-pin', label: 'staff row' }),
      },
      env,
    )
    expect(created.status).toBe(201)
    const { item } = (await created.json()) as { item: { id: string; label: string } }

    const readerCookie = await loginAs(app, env, 'team-reader@kit.local', TENANCY_PASSWORD)
    const patch = await app.request(
      `/api/items/${item.id}`,
      {
        method: 'PATCH',
        headers: sessionMutationOrg(readerCookie, 'org_team'),
        body: JSON.stringify({ label: 'Hacked' }),
      },
      env,
    )
    expect(patch.status).toBe(403)
    const patchBody = (await patch.json()) as { error: { code: string } }
    expect(patchBody.error.code).toBe('FORBIDDEN')

    const del = await app.request(
      `/api/items/${item.id}`,
      { method: 'DELETE', headers: sessionMutationOrg(readerCookie, 'org_team') },
      env,
    )
    expect(del.status).toBe(403)
    const delBody = (await del.json()) as { error: { code: string } }
    expect(delBody.error.code).toBe('FORBIDDEN')

    const still = await app.request(
      `/api/items/${item.id}`,
      { headers: { cookie: staffCookie } },
      env,
    )
    expect(still.status).toBe(200)
    const kept = (await still.json()) as { item: { label: string } }
    expect(kept.item.label).toBe('staff row')
  })

  it('returns 400 and inserts zero rows when team-reader POSTs without X-Org-Id', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const cookie = await loginAs(app, env, 'team-reader@kit.local', TENANCY_PASSWORD)

    const create = await app.request(
      '/api/items',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({ code: 'NOHDR', label: 'should fail' }),
      },
      env,
    )
    expect(create.status).toBe(400)

    const list = await app.request('/api/items', { headers: { cookie } }, env)
    expect(list.status).toBe(200)
    const listed = (await list.json()) as { items: { code: string }[] }
    expect(listed.items.some((i) => i.code === 'NOHDR')).toBe(false)
  })

  it('returns 201 when staff POSTs with X-Org-Id org_acme', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const cookie = await loginAs(app, env, 'staff@kit.local', TENANCY_PASSWORD)

    const create = await app.request(
      '/api/items',
      {
        method: 'POST',
        headers: sessionMutationOrg(cookie, 'org_acme'),
        body: JSON.stringify({ code: 'acme-write', label: 'staff write' }),
      },
      env,
    )
    expect(create.status).toBe(201)
    const body = (await create.json()) as { item: { code: string } }
    expect(body.item.code).toBe('acme-write')
  })

  it('returns 404 on GET IDOR demo@ vs demo-b@ without org header', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const cookieA = await loginAs(app, env, DEMO_EMAIL, DEMO_PASSWORD)
    const cookieB = await loginAs(app, env, DEMO_EMAIL_B, DEMO_PASSWORD_B)

    const own = await app.request(
      '/api/items/item_seed_catalog_a',
      { headers: { cookie: cookieA } },
      env,
    )
    expect(own.status).toBe(200)

    const idorGet = await app.request(
      '/api/items/item_seed_catalog_a',
      { headers: { cookie: cookieB } },
      env,
    )
    expect(idorGet.status).toBe(404)
  })
})
