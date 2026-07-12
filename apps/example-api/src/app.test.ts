import { mkdirSync, writeFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { resetRateLimits } from './lib/rate-limit'
import { getSecret, useSecureCookie } from './lib/session-env'
import { DEMO_EMAIL, DEMO_EMAIL_B, DEMO_PASSWORD, DEMO_PASSWORD_B } from './services/auth'
import { createMemoryEnv } from './test/memory-env'

const SCRATCH = process.env.SCRATCH || '/tmp/grok-goal-c818b205ecce/implementer'
const ORIGIN = 'http://localhost:5173'

function writeScratch(name: string, data: unknown) {
  try {
    mkdirSync(SCRATCH, { recursive: true })
    writeFileSync(`${SCRATCH}/${name}`, JSON.stringify(data, null, 2))
  } catch {
    // non-fatal — tests still assert
  }
}

/** Cookie-authenticated mutation headers (Origin required by originGuard). */
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
  const login = await app.request(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ email, password }),
    },
    env,
  )
  expect(login.status).toBe(200)
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!
  return cookie
}

beforeEach(() => {
  resetRateLimits()
})

describe('createApp shipped entry — health & errors', () => {
  it('GET /health returns 200 with requestId', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const res = await app.request('/health', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; requestId: string }
    expect(body.ok).toBe(true)
    expect(body.requestId).toMatch(/^req_/)
    expect(res.headers.get('x-request-id')).toBe(body.requestId)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    writeScratch('api-health.json', {
      status: res.status,
      body,
      headers: { 'x-request-id': res.headers.get('x-request-id') },
    })
  })

  it('POST /api/notes without auth returns nested UNAUTHORIZED', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const res = await app.request(
      '/api/notes',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
      env,
    )
    expect(res.status).toBe(401)
    const body = (await res.json()) as {
      error: { code: string; message: string }
      requestId: string
    }
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(body.requestId).toMatch(/^req_/)
    expect(JSON.stringify(body)).not.toMatch(/stack/i)
    writeScratch('api-error.json', { status: res.status, body })
  })

  it('POST /api/auth/login with invalid body returns VALIDATION_ERROR', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const res = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      },
      env,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string; details?: unknown } }
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('createApp dual auth + D1 + R2 (happy path)', () => {
  it('login → cookie session → GET /api/me succeeds', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const cookie = await loginAs(app, env, DEMO_EMAIL, DEMO_PASSWORD)

    const me = await app.request('/api/me', { headers: { cookie } }, env)
    expect(me.status).toBe(200)
    const meBody = (await me.json()) as {
      subject: string
      authMethod: string
      role: string
      requestId: string
    }
    expect(meBody.subject).toBe('user_demo')
    expect(meBody.authMethod).toBe('session')
    expect(meBody.role).toBe('admin')
    expect(meBody.requestId).toMatch(/^req_/)
  })

  it('login with wrong password returns UNAUTHORIZED', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    await loginAs(app, env, DEMO_EMAIL, DEMO_PASSWORD)
    const bad = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: DEMO_EMAIL, password: 'wrong-password' }),
      },
      env,
    )
    expect(bad.status).toBe(401)
    const body = (await bad.json()) as { error: { code: string } }
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('mint sk_ → Bearer GET /api/me succeeds; bad key 401; revoke works', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const cookie = await loginAs(app, env, DEMO_EMAIL, DEMO_PASSWORD)

    const mint = await app.request(
      '/api/keys',
      { method: 'POST', headers: sessionMutation(cookie) },
      env,
    )
    expect(mint.status).toBe(200)
    const minted = (await mint.json()) as { id: string; key: string; keyPrefix?: string }
    expect(minted.key.startsWith('sk_')).toBe(true)

    const me = await app.request(
      '/api/me',
      { headers: { authorization: `Bearer ${minted.key}` } },
      env,
    )
    expect(me.status).toBe(200)
    const meBody = (await me.json()) as { subject: string; authMethod: string }
    expect(meBody.subject).toBe('user_demo')
    expect(meBody.authMethod).toBe('api_key')

    // Cannot mint a new key with sk_ (session only)
    const chain = await app.request(
      '/api/keys',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${minted.key}`,
          'content-type': 'application/json',
        },
        body: '{}',
      },
      env,
    )
    expect(chain.status).toBe(403)

    const list = await app.request('/api/keys', { headers: { cookie } }, env)
    expect(list.status).toBe(200)
    const listed = (await list.json()) as {
      keys: { id: string; keyPrefix: string; revokedAt: number | null }[]
    }
    const meta = listed.keys.find((k) => k.id === minted.id)
    expect(meta?.revokedAt).toBeNull()
    expect(meta?.keyPrefix).toBe(minted.key.slice(0, 12))

    // Wrong hash same prefix → 401
    const fakeSamePrefix = `${minted.key.slice(0, 12)}${'0'.repeat(40)}`
    const wrongHash = await app.request(
      '/api/me',
      { headers: { authorization: `Bearer ${fakeSamePrefix}` } },
      env,
    )
    expect(wrongHash.status).toBe(401)

    const rev = await app.request(
      `/api/keys/${minted.id}`,
      { method: 'DELETE', headers: sessionMutation(cookie) },
      env,
    )
    expect(rev.status).toBe(200)

    const meAfter = await app.request(
      '/api/me',
      { headers: { authorization: `Bearer ${minted.key}` } },
      env,
    )
    expect(meAfter.status).toBe(401)

    const bad = await app.request(
      '/api/me',
      { headers: { authorization: 'Bearer sk_not_a_real_key_000000000000' } },
      env,
    )
    expect(bad.status).toBe(401)
    const badBody = (await bad.json()) as { error: { code: string }; requestId: string }
    expect(badBody.error.code).toBe('UNAUTHORIZED')
    expect(badBody.requestId).toMatch(/^req_/)
  })

  it('rejects expired API keys', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const cookie = await loginAs(app, env, DEMO_EMAIL, DEMO_PASSWORD)
    const { createDb } = await import('@gosilex/db')
    const { schema } = await import('./db/schema')
    const { mintApiKey } = await import('./services/auth')
    const db = createDb(env.DB, schema)
    const minted = await mintApiKey(db, 'user_demo', { expiresAt: Date.now() - 1000, name: 'old' })
    const res = await app.request(
      '/api/me',
      { headers: { authorization: `Bearer ${minted.key}` } },
      env,
    )
    expect(res.status).toBe(401)
  })

  it('cookie mutations require trusted Origin', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const cookie = await loginAs(app, env, DEMO_EMAIL, DEMO_PASSWORD)

    const missing = await app.request(
      '/api/keys',
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: '{}',
      },
      env,
    )
    expect(missing.status).toBe(403)

    const evil = await app.request(
      '/api/keys',
      {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
          Origin: 'https://evil.example',
        },
        body: '{}',
      },
      env,
    )
    expect(evil.status).toBe(403)
  })

  it('D1 notes CRUD + R2 attachment under demo/ prefix', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const cookie = await loginAs(app, env, DEMO_EMAIL, DEMO_PASSWORD)
    const auth = sessionMutation(cookie)

    const create = await app.request(
      '/api/notes',
      {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          title: 'Kit note',
          body: 'hello d1',
          attachmentText: 'r2-payload-demo',
        }),
      },
      env,
    )
    expect(create.status).toBe(201)
    const created = (await create.json()) as {
      note: { id: string; title: string; body: string }
      requestId: string
    }
    expect(created.note.title).toBe('Kit note')
    expect(created.note.body).toBe('hello d1')
    expect(created.note.id).toBeTruthy()

    const list = await app.request('/api/notes', { headers: { cookie } }, env)
    expect(list.status).toBe(200)
    const listed = (await list.json()) as { notes: { id: string }[] }
    expect(listed.notes.some((n) => n.id === created.note.id)).toBe(true)

    const get = await app.request(`/api/notes/${created.note.id}`, { headers: { cookie } }, env)
    expect(get.status).toBe(200)
    const one = (await get.json()) as {
      note: { id: string; attachment: string | null }
    }
    expect(one.note.attachment).toBe('r2-payload-demo')

    const keys = env.BUCKET._keys?.() ?? []
    expect(keys.some((k) => k.startsWith(`demo/${created.note.id}/`))).toBe(true)
    expect(keys.every((k) => !k.startsWith('share/'))).toBe(true)

    const del = await app.request(
      `/api/notes/${created.note.id}`,
      {
        method: 'DELETE',
        headers: auth,
      },
      env,
    )
    expect(del.status).toBe(200)

    const listAfter = await app.request('/api/notes', { headers: { cookie } }, env)
    const after = (await listAfter.json()) as { notes: { id: string }[] }
    expect(after.notes.some((n) => n.id === created.note.id)).toBe(false)

    const missing = await app.request(
      '/api/notes/00000000-0000-4000-8000-000000000099',
      {
        headers: { cookie },
      },
      env,
    )
    expect(missing.status).toBe(404)
    const missingBody = (await missing.json()) as { error: { code: string } }
    expect(missingBody.error.code).toBe('NOT_FOUND')
  })

  it('getSecret fails closed without explicit development|test', () => {
    const base = { DB: {} as never, BUCKET: {} as never }
    expect(() => getSecret({ ...base, ENVIRONMENT: 'production' })).toThrow(/SESSION_SECRET/)
    expect(() => getSecret({ ...base, ENVIRONMENT: 'staging' })).toThrow(/SESSION_SECRET/)
    expect(() => getSecret({ ...base })).toThrow(/SESSION_SECRET/)
    expect(getSecret({ ...base, ENVIRONMENT: 'development' })).toMatch(/dev-session/)
    expect(getSecret({ ...base, ENVIRONMENT: 'test' })).toMatch(/dev-session/)
    expect(
      getSecret({
        ...base,
        ENVIRONMENT: 'production',
        SESSION_SECRET: 'prod-session-secret-at-least-32-chars!!',
      }),
    ).toBe('prod-session-secret-at-least-32-chars!!')
  })

  it('useSecureCookie is false only for development|test', () => {
    const base = { DB: {} as never, BUCKET: {} as never }
    expect(useSecureCookie({ ...base, ENVIRONMENT: 'development' })).toBe(false)
    expect(useSecureCookie({ ...base, ENVIRONMENT: 'test' })).toBe(false)
    expect(useSecureCookie({ ...base, ENVIRONMENT: 'production' })).toBe(true)
    expect(useSecureCookie({ ...base, ENVIRONMENT: 'staging' })).toBe(true)
    expect(useSecureCookie({ ...base })).toBe(true)
  })

  it('login sets Secure cookie outside development|test', async () => {
    const app = createApp()
    const env = createMemoryEnv({
      ENVIRONMENT: 'staging',
      SESSION_SECRET: 'staging-session-secret-at-least-32ch!',
    })
    const { createDb } = await import('@gosilex/db')
    const { schema } = await import('./db/schema')
    const { seedDemoDatabase } = await import('./seed/seed-db')
    await seedDemoDatabase(createDb(env.DB, schema), { notes: false })

    const login = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
      },
      env,
    )
    expect(login.status).toBe(200)
    expect(login.headers.get('set-cookie')).toMatch(/Secure/i)
    expect(login.headers.get('strict-transport-security')).toMatch(/max-age/i)
  })

  it('login does not auto-seed demo users in production', async () => {
    const app = createApp()
    const env = createMemoryEnv({
      ENVIRONMENT: 'production',
      SESSION_SECRET: 'prod-session-secret-at-least-32-chars!!',
    })
    const login = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
      },
      env,
    )
    expect(login.status).toBe(401)
    const body = (await login.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(JSON.stringify(body)).not.toMatch(/SESSION_SECRET/i)
  })

  it('protected routes reject unauthenticated without per-handler requireAuth calls', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    for (const path of ['/api/me', '/api/notes', '/api/keys'] as const) {
      const method = path === '/api/keys' ? 'POST' : 'GET'
      const res = await app.request(
        path,
        {
          method,
          headers: path === '/api/keys' ? { 'content-type': 'application/json' } : undefined,
          body: path === '/api/keys' ? '{}' : undefined,
        },
        env,
      )
      expect(res.status).toBe(401)
    }
  })

  it('CORS rejects unknown Origin (no reflect)', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const res = await app.request(
      '/health',
      {
        headers: {
          Origin: 'https://evil.example',
        },
      },
      env,
    )
    expect(res.status).toBe(200)
    const acao = res.headers.get('access-control-allow-origin')
    expect(acao).not.toBe('https://evil.example')
    expect(acao === null || acao === '' || acao === 'null').toBe(true)

    const ok = await app.request('/health', { headers: { Origin: 'http://localhost:5173' } }, env)
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
  })

  it('notes are subject-scoped (IDOR: B cannot read A note)', async () => {
    const app = createApp()
    const env = createMemoryEnv()

    const cookieA = await loginAs(app, env, DEMO_EMAIL, DEMO_PASSWORD)

    const created = await app.request(
      '/api/notes',
      {
        method: 'POST',
        headers: sessionMutation(cookieA),
        body: JSON.stringify({ title: 'A private', body: 'secret-to-a' }),
      },
      env,
    )
    expect(created.status).toBe(201)
    const noteId = ((await created.json()) as { note: { id: string } }).note.id

    const cookieB = await loginAs(app, env, DEMO_EMAIL_B, DEMO_PASSWORD_B)

    const listB = await app.request('/api/notes', { headers: { cookie: cookieB } }, env)
    expect(listB.status).toBe(200)
    const notesB = ((await listB.json()) as { notes: { id: string }[] }).notes
    expect(notesB.some((n) => n.id === noteId)).toBe(false)

    const getB = await app.request(`/api/notes/${noteId}`, { headers: { cookie: cookieB } }, env)
    expect(getB.status).toBe(404)
    const body = (await getB.json()) as { error: { code: string } }
    expect(body.error.code).toBe('NOT_FOUND')

    const delB = await app.request(
      `/api/notes/${noteId}`,
      { method: 'DELETE', headers: sessionMutation(cookieB) },
      env,
    )
    expect(delB.status).toBe(404)

    const getA = await app.request(`/api/notes/${noteId}`, { headers: { cookie: cookieA } }, env)
    expect(getA.status).toBe(200)
  })
})
