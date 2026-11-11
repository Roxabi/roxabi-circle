import { getBetterAuthSecret } from '@kit/auth'
import { createBetterAuth } from '@kit/auth/factory'
import { baSession } from '@kit/auth/schema'
import { eq } from 'drizzle-orm'
import { expect, it, vi } from 'vitest'
import { TENANCY_PASSWORD } from '../seed/tenancy-data'
import { createSeededDemoApi, loginCookie, TEST_ORIGIN } from '../test/api-fixture'
import { createMemoryEnv } from '../test/memory-env'

it.each(['handler', 'fetch', 'app'] as const)(
  'does not emit the session token when D1 rejects creation via %s',
  async (entry) => {
    const { app, env, db } = await createSeededDemoApi({
      seed: { notes: false, environment: 'test' },
    })
    await env.DB.exec(
      "CREATE TRIGGER reject_session_log_test BEFORE INSERT ON \"session\" WHEN NEW.user_id = 'user_staff' BEGIN SELECT RAISE(ABORT, 'session_insert_rejected'); END;",
    )
    const auth = createBetterAuth({
      database: env.DB,
      secret: getBetterAuthSecret(env),
      baseURL: 'http://localhost:8787',
      trustedOrigins: [TEST_ORIGIN],
      allowLoopbackOrigins: true,
    })
    const calls: unknown[][] = []
    const spies = (['log', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        calls.push(args)
      }),
    )
    const originalPrepare = env.DB.prepare.bind(env.DB)
    let token: unknown
    let rejected = false
    const prepareSpy = vi.spyOn(env.DB, 'prepare').mockImplementation((sql) => {
      const statement = originalPrepare(sql)
      const match = /^\s*insert\s+into\s+["`[]?session["`\]]?\s*\(([^)]+)\)/i.exec(sql)
      if (!match) return statement
      const columns = match[1]!.split(',').map((column) => column.trim().replace(/["`[\]]/g, ''))
      const tokenIndex = columns.indexOf('token')
      const bind = statement.bind.bind(statement)
      statement.bind = (...values: unknown[]) => {
        if (tokenIndex >= 0) token = values[tokenIndex]
        const bound = bind(...values)
        return new Proxy(bound, {
          get(target, property, receiver) {
            const value: unknown = Reflect.get(target, property, receiver)
            if (
              (property !== 'raw' && property !== 'all' && property !== 'run') ||
              typeof value !== 'function'
            ) {
              return value
            }
            return (...args: unknown[]) =>
              (Reflect.apply(value, target, args) as Promise<unknown>).catch((error: unknown) => {
                if (error instanceof Error && error.message.includes('session_insert_rejected')) {
                  rejected = true
                }
                throw error
              })
          },
        })
      }
      return statement
    })
    let status = 0
    let setCookie: string | null = null
    let contentTypeOptions: string | null = null
    try {
      const request = new Request('http://localhost:8787/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: TEST_ORIGIN },
        body: JSON.stringify({ email: 'staff@kit.local', password: TENANCY_PASSWORD }),
      })
      let response: Response
      if (entry === 'app') {
        response = await app.request(request, undefined, env)
      } else if (entry === 'fetch') {
        if (!('fetch' in auth) || typeof auth.fetch !== 'function') throw new Error('missing fetch')
        const result: unknown = await auth.fetch(request)
        if (!(result instanceof Response)) throw new Error('fetch did not return a Response')
        response = result
      } else {
        response = await auth.handler(request)
      }
      status = response.status
      setCookie = response.headers.get('set-cookie')
      contentTypeOptions = response.headers.get('x-content-type-options')
    } finally {
      prepareSpy.mockRestore()
      for (const spy of spies) spy.mockRestore()
    }
    const hasToken = typeof token === 'string' && token.length > 0
    const secrets = [token, getBetterAuthSecret(env), TENANCY_PASSWORD]
    const noTokenLogged = calls.every((args) =>
      args.every(
        (arg) =>
          typeof arg === 'string' &&
          secrets.every((secret) => typeof secret !== 'string' || !arg.includes(secret)),
      ),
    )
    const safeError = calls.some(
      (args) => args.length === 1 && args[0] === '[Better Auth] handler_exception',
    )
    const sessions = await db.select().from(baSession).where(eq(baSession.userId, 'user_staff'))
    expect(status).toBeGreaterThanOrEqual(500)
    expect(setCookie === null).toBe(true)
    expect(rejected).toBe(true)
    expect(hasToken).toBe(true)
    expect(safeError).toBe(true)
    expect(noTokenLogged).toBe(true)
    expect(sessions.length).toBe(0)
    if (entry === 'app') expect(contentTypeOptions).toBe('nosniff')
  },
)

it('preserves origin rejection and records APIError 5xx responses safely', async () => {
  const { app, env, db } = await createSeededDemoApi({
    seed: { notes: false, environment: 'test' },
  })
  const cookie = await loginCookie(app, env, 'staff@kit.local', TENANCY_PASSWORD)
  const expiry = new Date(Date.now() + 60 * 60 * 1000)
  await db.update(baSession).set({ expiresAt: expiry }).where(eq(baSession.userId, 'user_staff'))
  const [before] = await db.select().from(baSession).where(eq(baSession.userId, 'user_staff'))
  const token = before?.token
  await env.DB.exec(
    'CREATE TRIGGER reject_session_refresh BEFORE UPDATE ON "session" BEGIN SELECT RAISE(ABORT, \'session_refresh_rejected\'); END;',
  )
  const auth = createBetterAuth({
    database: env.DB,
    secret: getBetterAuthSecret(env),
    baseURL: 'http://localhost:8787',
    trustedOrigins: [TEST_ORIGIN],
    allowLoopbackOrigins: true,
    // Match the example's test-environment cookie prefix.
    useSecureCookies: false,
  })
  const baseline = await auth.handler(
    new Request('http://localhost:8787/api/auth/get-session?disableRefresh=true', {
      headers: { cookie },
    }),
  )
  const identity: unknown = await baseline.json()
  const authenticated =
    typeof identity === 'object' &&
    identity !== null &&
    'user' in identity &&
    typeof identity.user === 'object' &&
    identity.user !== null &&
    'id' in identity.user &&
    identity.user.id === 'user_staff'
  expect(baseline.status).toBe(200)
  expect(authenticated).toBe(true)
  const calls: unknown[][] = []
  const spies = (['log', 'warn', 'error', 'debug'] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      calls.push(args)
    }),
  )
  let originStatus = 0
  let sessionStatus = 0
  try {
    const forbidden = await auth.handler(
      new Request('http://localhost:8787/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://untrusted.example' },
        body: JSON.stringify({ email: 'staff@kit.local', password: TENANCY_PASSWORD }),
      }),
    )
    originStatus = forbidden.status
    // The real session endpoint catches the rejected refresh as an APIError 500.
    const failed = await auth.handler(
      new Request('http://localhost:8787/api/auth/get-session', { headers: { cookie } }),
    )
    sessionStatus = failed.status
  } finally {
    for (const spy of spies) spy.mockRestore()
  }
  const safeResponseEvent = calls.some(
    (args) => args.length === 1 && args[0] === '[Better Auth] server_error_response',
  )
  const safeCalls = calls.every((args) =>
    args.every(
      (arg) =>
        typeof arg === 'string' &&
        (typeof token !== 'string' || !arg.includes(token)) &&
        !arg.includes(cookie) &&
        !arg.includes(TENANCY_PASSWORD) &&
        !arg.includes(getBetterAuthSecret(env)),
    ),
  )
  const libraryEvent = calls.some(
    (args) => args.length === 1 && args[0] === '[Better Auth] library_event',
  )
  const handlerException = calls.some(
    (args) => args.length === 1 && args[0] === '[Better Auth] handler_exception',
  )
  const [after] = await db.select().from(baSession).where(eq(baSession.userId, 'user_staff'))
  expect(originStatus).toBe(403)
  expect(sessionStatus).toBeGreaterThanOrEqual(500)
  expect(safeResponseEvent).toBe(true)
  expect(typeof token === 'string' && token.length > 0).toBe(true)
  expect(libraryEvent).toBe(true)
  expect(handlerException).toBe(false)
  expect(after?.expiresAt.getTime()).toBe(before?.expiresAt.getTime())
  expect(safeCalls).toBe(true)
})

it('fails closed without logging an invalid initialization value', async () => {
  const env = createMemoryEnv()
  const calls: unknown[][] = []
  const spies = (['log', 'warn', 'error', 'debug'] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      calls.push(args)
    }),
  )
  vi.stubEnv('BETTER_AUTH_SECRETS', TENANCY_PASSWORD)
  let status = 0
  try {
    const auth = createBetterAuth({
      database: env.DB,
      secret: getBetterAuthSecret(env),
      baseURL: 'http://localhost:8787',
      trustedOrigins: [TEST_ORIGIN],
      allowLoopbackOrigins: true,
    })
    status = (await auth.handler(new Request('http://localhost:8787/api/auth/ok'))).status
  } finally {
    vi.unstubAllEnvs()
    for (const spy of spies) spy.mockRestore()
  }
  const safeError = calls.some(
    (args) => args.length === 1 && args[0] === '[Better Auth] handler_exception',
  )
  const safeCalls = calls.every((args) =>
    args.every((arg) => typeof arg === 'string' && !arg.includes(TENANCY_PASSWORD)),
  )
  expect(status).toBe(500)
  expect(safeError).toBe(true)
  expect(safeCalls).toBe(true)
})
