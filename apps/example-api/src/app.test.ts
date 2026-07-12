import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import { getSecret, useSecureCookie } from './lib/session-env'
import { DEMO_EMAIL, DEMO_EMAIL_B, DEMO_PASSWORD, DEMO_PASSWORD_B } from './services/auth'
import { createMemoryEnv } from './test/memory-env'

const SCRATCH = process.env.SCRATCH || '/tmp/grok-goal-c818b205ecce/implementer'

function writeScratch(name: string, data: unknown) {
  try {
    mkdirSync(SCRATCH, { recursive: true })
    writeFileSync(`${SCRATCH}/${name}`, JSON.stringify(data, null, 2))
  } catch {
    // non-fatal — tests still assert
  }
}

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
    const loginBody = (await login.json()) as { subject: string; requestId: string }
    expect(loginBody.subject).toBe('user_demo')
    expect(loginBody.requestId).toMatch(/^req_/)

    const setCookie = login.headers.get('set-cookie')
    expect(setCookie).toBeTruthy()
    expect(setCookie).toMatch(/gosilex_session=/)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
    const cookie = setCookie!.split(';')[0]

    const me = await app.request('/api/me', { headers: { cookie } }, env)
    expect(me.status).toBe(200)
    const meBody = (await me.json()) as {
      subject: string
      authMethod: string
      requestId: string
    }
    expect(meBody.subject).toBe('user_demo')
    expect(meBody.authMethod).toBe('session')
    expect(meBody.requestId).toMatch(/^req_/)
  })

  it('login with wrong password returns UNAUTHORIZED', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    // seed demo user
    await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
      },
      env,
    )
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

  it('mint sk_ → Bearer GET /api/me succeeds; bad key 401', async () => {
    const app = createApp()
    const env = createMemoryEnv()

    const login = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
      },
      env,
    )
    const cookie = login.headers.get('set-cookie')!.split(';')[0]

    const mint = await app.request(
      '/api/keys',
      { method: 'POST', headers: { cookie, 'content-type': 'application/json' } },
      env,
    )
    expect(mint.status).toBe(200)
    const minted = (await mint.json()) as { id: string; key: string }
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

  it('D1 notes CRUD + R2 attachment under demo/ prefix', async () => {
    const app = createApp()
    const env = createMemoryEnv()

    const login = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
      },
      env,
    )
    const cookie = login.headers.get('set-cookie')!.split(';')[0]
    const auth = { cookie, 'content-type': 'application/json' }

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

    const list = await app.request('/api/notes', { headers: auth }, env)
    expect(list.status).toBe(200)
    const listed = (await list.json()) as { notes: { id: string }[] }
    expect(listed.notes.some((n) => n.id === created.note.id)).toBe(true)

    const get = await app.request(`/api/notes/${created.note.id}`, { headers: auth }, env)
    expect(get.status).toBe(200)
    const one = (await get.json()) as {
      note: { id: string; attachment: string | null }
    }
    expect(one.note.attachment).toBe('r2-payload-demo')

    // R2 keys must use demo/ never share/
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

    const listAfter = await app.request('/api/notes', { headers: auth }, env)
    const after = (await listAfter.json()) as { notes: { id: string }[] }
    expect(after.notes.some((n) => n.id === created.note.id)).toBe(false)

    const missing = await app.request(
      '/api/notes/00000000-0000-4000-8000-000000000099',
      {
        headers: auth,
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
    // Missing ENVIRONMENT is NOT treated as development (deploy footgun closed)
    expect(() => getSecret({ ...base })).toThrow(/SESSION_SECRET/)
    // Explicit local envs may use fallback when secret absent
    expect(getSecret({ ...base, ENVIRONMENT: 'development' })).toMatch(/dev-session/)
    expect(getSecret({ ...base, ENVIRONMENT: 'test' })).toMatch(/dev-session/)
    // Real secret always wins
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
    // missing env → Secure (safer default for unknown deploy)
    expect(useSecureCookie({ ...base })).toBe(true)
  })

  it('login sets Secure cookie outside development|test', async () => {
    const app = createApp()
    const env = createMemoryEnv({
      ENVIRONMENT: 'staging',
      SESSION_SECRET: 'staging-session-secret-at-least-32ch!',
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
    expect(login.status).toBe(200)
    expect(login.headers.get('set-cookie')).toMatch(/Secure/i)
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
    // Hono omits or nulls ACAO when origin callback returns null
    const acao = res.headers.get('access-control-allow-origin')
    expect(acao).not.toBe('https://evil.example')
    expect(acao === null || acao === '' || acao === 'null').toBe(true)

    const ok = await app.request('/health', { headers: { Origin: 'http://localhost:5173' } }, env)
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
  })

  it('notes are subject-scoped (IDOR: B cannot read A note)', async () => {
    const app = createApp()
    const env = createMemoryEnv()

    const loginA = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
      },
      env,
    )
    expect(loginA.status).toBe(200)
    const cookieA = loginA.headers.get('set-cookie')!.split(';')[0]

    const created = await app.request(
      '/api/notes',
      {
        method: 'POST',
        headers: { cookie: cookieA, 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'A private', body: 'secret-to-a' }),
      },
      env,
    )
    expect(created.status).toBe(201)
    const noteId = ((await created.json()) as { note: { id: string } }).note.id

    const loginB = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: DEMO_EMAIL_B, password: DEMO_PASSWORD_B }),
      },
      env,
    )
    expect(loginB.status).toBe(200)
    const cookieB = loginB.headers.get('set-cookie')!.split(';')[0]

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
      { method: 'DELETE', headers: { cookie: cookieB } },
      env,
    )
    expect(delB.status).toBe(404)

    // Owner still has the note
    const getA = await app.request(`/api/notes/${noteId}`, { headers: { cookie: cookieA } }, env)
    expect(getA.status).toBe(200)
  })
})
