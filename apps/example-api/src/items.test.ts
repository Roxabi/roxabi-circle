import { createDb } from '@gosilex/db'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import { schema } from './db/schema'
import { DEMO_EMAIL, DEMO_EMAIL_B, DEMO_PASSWORD, DEMO_PASSWORD_B } from './seed/demo-data'
import { seedDemoDatabase } from './seed/seed-db'
import { createMemoryEnv } from './test/memory-env'

const ORIGIN = 'http://localhost:5173'

function sessionMutation(cookie: string): Record<string, string> {
  return {
    cookie,
    'content-type': 'application/json',
    Origin: ORIGIN,
  }
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
    const cookieA = await loginAs(app, env, DEMO_EMAIL, DEMO_PASSWORD)
    const cookieB = await loginAs(app, env, DEMO_EMAIL_B, DEMO_PASSWORD_B)

    const create = await app.request(
      '/api/items',
      {
        method: 'POST',
        headers: sessionMutation(cookieA),
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
        headers: sessionMutation(cookieA),
        body: JSON.stringify({ code: 'sku-alpha', label: 'Dup' }),
      },
      env,
    )
    expect(dup.status).toBe(409)
    const dupBody = (await dup.json()) as { error: { code: string } }
    expect(dupBody.error.code).toBe('CONFLICT')

    const listA = await app.request('/api/items', { headers: { cookie: cookieA } }, env)
    expect(listA.status).toBe(200)
    const listed = (await listA.json()) as { items: { id: string }[] }
    expect(listed.items.some((i) => i.id === id)).toBe(true)

    const idorGet = await app.request(`/api/items/${id}`, { headers: { cookie: cookieB } }, env)
    expect(idorGet.status).toBe(404)

    const idorPatch = await app.request(
      `/api/items/${id}`,
      {
        method: 'PATCH',
        headers: sessionMutation(cookieB),
        body: JSON.stringify({ label: 'Hacked' }),
      },
      env,
    )
    expect(idorPatch.status).toBe(404)

    const idorDel = await app.request(
      `/api/items/${id}`,
      { method: 'DELETE', headers: sessionMutation(cookieB) },
      env,
    )
    expect(idorDel.status).toBe(404)

    const patch = await app.request(
      `/api/items/${id}`,
      {
        method: 'PATCH',
        headers: sessionMutation(cookieA),
        body: JSON.stringify({ label: 'Alpha v2', active: false }),
      },
      env,
    )
    expect(patch.status).toBe(200)
    const patched = (await patch.json()) as { item: { label: string; active: boolean } }
    expect(patched.item.label).toBe('Alpha v2')
    expect(patched.item.active).toBe(false)

    const filtered = await app.request('/api/items?q=Alpha', { headers: { cookie: cookieA } }, env)
    expect(filtered.status).toBe(200)
    const fbody = (await filtered.json()) as { items: { id: string }[] }
    expect(fbody.items.some((i) => i.id === id)).toBe(true)

    const del = await app.request(
      `/api/items/${id}`,
      { method: 'DELETE', headers: sessionMutation(cookieA) },
      env,
    )
    expect(del.status).toBe(200)
    const gone = await app.request(`/api/items/${id}`, { headers: { cookie: cookieA } }, env)
    expect(gone.status).toBe(404)
  })
})
