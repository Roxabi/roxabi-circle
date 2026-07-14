import { AppError } from '@gosilex/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { assertRateLimit, resetRateLimits } from './lib/rate-limit'
import { getSecret, useSecureCookie } from './lib/session-env'
import { DEMO_EMAIL, DEMO_EMAIL_B, DEMO_PASSWORD, DEMO_PASSWORD_B } from './services/auth'
import { createMemoryEnv } from './test/memory-env'

const ORIGIN = 'http://localhost:5173'

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
  })

  it('unknown route returns nested NOT_FOUND envelope', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const res = await app.request('/nope', {}, env)
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string }; requestId: string }
    expect(body.error.code).toBe('NOT_FOUND')
    expect(body.requestId).toMatch(/^req_/)
    expect(res.headers.get('x-request-id')).toBe(body.requestId)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('ignores oversized or non-allowlisted client x-request-id', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const res = await app.request(
      '/health',
      { headers: { 'x-request-id': 'not-a-valid-id<script>' } },
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { requestId: string }
    expect(body.requestId).toMatch(/^req_/)
    expect(body.requestId).not.toContain('<')
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
    // Seed demo users via login (session cookie unused — we mint expired key directly)
    await loginAs(app, env, DEMO_EMAIL, DEMO_PASSWORD)
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

  it('getSecret rejects short secrets and kit placeholders outside dev|test', () => {
    const base = { DB: {} as never, BUCKET: {} as never }
    expect(() =>
      getSecret({ ...base, ENVIRONMENT: 'development', SESSION_SECRET: 'too-short' }),
    ).toThrow(/at least 32/)
    expect(() =>
      getSecret({
        ...base,
        ENVIRONMENT: 'production',
        SESSION_SECRET: 'dev-session-secret-change-me-32chars!!',
      }),
    ).toThrow(/placeholder/)
    expect(
      getSecret({
        ...base,
        ENVIRONMENT: 'development',
        SESSION_SECRET: 'dev-session-secret-change-me-32chars!!',
      }),
    ).toBe('dev-session-secret-change-me-32chars!!')
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
        headers: { 'content-type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
      },
      env,
    )
    expect(login.status).toBe(200)
    const setCookie = login.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/Secure/i)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
    expect(login.headers.get('strict-transport-security')).toMatch(/max-age/i)
  })

  it('logout clears cookie flags (HMAC session remains valid until exp — ADR-0002)', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const cookie = await loginAs(app, env, DEMO_EMAIL, DEMO_PASSWORD)
    const logout = await app.request(
      '/api/auth/logout',
      { method: 'POST', headers: sessionMutation(cookie) },
      env,
    )
    expect(logout.status).toBe(200)
    const clear = logout.headers.get('set-cookie') ?? ''
    expect(clear).toMatch(/Max-Age=0/i)
    expect(clear).toMatch(/HttpOnly/i)
    expect(clear).toMatch(/SameSite=Lax/i)
    // Stateless interim: server still accepts unexpired MAC if client re-sends cookie.
    const me = await app.request('/api/me', { headers: { cookie } }, env)
    expect(me.status).toBe(200)
  })

  it('CP-AUTH-DUAL: invalid Bearer wins over valid session cookie', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const cookie = await loginAs(app, env, DEMO_EMAIL, DEMO_PASSWORD)
    const res = await app.request(
      '/api/me',
      {
        headers: {
          cookie,
          authorization: 'Bearer sk_deadbeef0001dead',
        },
      },
      env,
    )
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('assertRateLimit throws AppError RATE_LIMITED with retryAfterSeconds', () => {
    assertRateLimit('unit:test', 2, 60_000)
    assertRateLimit('unit:test', 2, 60_000)
    try {
      assertRateLimit('unit:test', 2, 60_000)
      expect.fail('expected rate limit throw')
    } catch (e) {
      expect(e).toBeInstanceOf(AppError)
      const err = e as AppError
      expect(err.code).toBe('RATE_LIMITED')
      expect(err.status).toBe(429)
      expect(err.details).toEqual({ retryAfterSeconds: 60 })
    }
  })

  it('login returns 429 after rate limit exceeded', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    // Pre-fill the same bucket key as authRoutes (avoids 20× PBKDF2 in CI).
    const windowMs = 15 * 60 * 1000
    for (let i = 0; i < 20; i++) {
      assertRateLimit('login:203.0.113.9', 20, windowMs)
    }
    const blocked = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Origin: ORIGIN,
          'cf-connecting-ip': '203.0.113.9',
        },
        body: JSON.stringify({ email: 'nobody@example.com', password: 'x' }),
      },
      env,
    )
    expect(blocked.status).toBe(429)
    const body = (await blocked.json()) as { error: { code: string } }
    expect(body.error.code).toBe('RATE_LIMITED')
    // Login window is 15 minutes → Retry-After should match window seconds.
    expect(blocked.headers.get('retry-after')).toBe('900')
  })

  it('mint returns 429 after rate limit exceeded', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const cookie = await loginAs(app, env, DEMO_EMAIL, DEMO_PASSWORD)
    const me = await app.request('/api/me', { headers: { cookie } }, env)
    const subject = ((await me.json()) as { subject: string }).subject
    const windowMs = 60 * 60 * 1000
    for (let i = 0; i < 30; i++) {
      assertRateLimit(`mint:${subject}`, 30, windowMs)
    }
    const blocked = await app.request(
      '/api/keys',
      { method: 'POST', headers: sessionMutation(cookie), body: '{}' },
      env,
    )
    expect(blocked.status).toBe(429)
    const body = (await blocked.json()) as { error: { code: string } }
    expect(body.error.code).toBe('RATE_LIMITED')
    expect(blocked.headers.get('retry-after')).toBe('3600')
  })

  it('demo email returns 429 after rate limit exceeded', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const cookie = await loginAs(app, env, DEMO_EMAIL, DEMO_PASSWORD)
    const me = await app.request('/api/me', { headers: { cookie } }, env)
    const subject = ((await me.json()) as { subject: string }).subject
    const windowMs = 60 * 60 * 1000
    for (let i = 0; i < 10; i++) {
      assertRateLimit(`email:${subject}`, 10, windowMs)
    }
    const blocked = await app.request(
      '/api/demo/email',
      { method: 'POST', headers: sessionMutation(cookie), body: '{}' },
      env,
    )
    expect(blocked.status).toBe(429)
    const body = (await blocked.json()) as { error: { code: string } }
    expect(body.error.code).toBe('RATE_LIMITED')
    expect(blocked.headers.get('retry-after')).toBe('3600')
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
        headers: { 'content-type': 'application/json', Origin: ORIGIN },
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
    const cases: { method: string; path: string; body?: string }[] = [
      { method: 'GET', path: '/api/me' },
      { method: 'GET', path: '/api/notes' },
      { method: 'GET', path: '/api/notes/fake-id' },
      { method: 'DELETE', path: '/api/notes/fake-id' },
      { method: 'POST', path: '/api/keys', body: '{}' },
      { method: 'POST', path: '/api/demo/email', body: '{}' },
    ]
    for (const { method, path, body } of cases) {
      const res = await app.request(
        path,
        {
          method,
          headers: body ? { 'content-type': 'application/json' } : undefined,
          body,
        },
        env,
      )
      expect(res.status, `${method} ${path}`).toBe(401)
      const json = (await res.json()) as { error: { code: string } }
      expect(json.error.code).toBe('UNAUTHORIZED')
    }
  })

  it('authed note create rejects empty title with VALIDATION_ERROR', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const cookie = await loginAs(app, env, DEMO_EMAIL, DEMO_PASSWORD)
    const res = await app.request(
      '/api/notes',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({ title: '' }),
      },
      env,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('VALIDATION_ERROR')
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
