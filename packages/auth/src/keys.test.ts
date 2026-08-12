import { describe, expect, it } from 'vitest'
import { type BetterAuthLike, createBetterAuthSessionPort } from './better-auth-port'
import { sessionCookieName } from './cookie-name'
import {
  apiKeyPrefix,
  generateApiKey,
  hashApiKey,
  hashPassword,
  PBKDF2_ITERS,
  PBKDF2_MAX_ITERS,
  parseBearer,
  verifyApiKey,
  verifyPassword,
} from './keys'
import { createRequireAuth, resolveDualAuth } from './require-auth'
import {
  clearSessionCookieHeader,
  parseCookie,
  SESSION_COOKIE,
  sessionCookieHeader,
} from './session'

function baPort(
  user: { id: string; email?: string } | null,
  expMs = 60_000,
): ReturnType<typeof createBetterAuthSessionPort> {
  if (!user) {
    return createBetterAuthSessionPort({
      getAuth: () => ({ api: { getSession: async () => null } }),
    })
  }
  return createBetterAuthSessionPort({
    getAuth: () => ({
      api: {
        getSession: async () => ({
          user: { id: user.id, email: user.email ?? 'x@y.z' },
          session: { expiresAt: new Date(Date.now() + expMs) },
        }),
      },
    }),
  })
}

describe('api keys', () => {
  it('hashes and verifies with timing-safe compare', async () => {
    const key = generateApiKey()
    expect(key.startsWith('sk_')).toBe(true)
    const h = await hashApiKey(key)
    expect(h).toHaveLength(64)
    expect(await verifyApiKey(key, h)).toBe(true)
    expect(await verifyApiKey('sk_wrong', h)).toBe(false)
  })

  it('apiKeyPrefix is stable 12-char prefix', () => {
    const key = generateApiKey()
    expect(apiKeyPrefix(key)).toBe(key.slice(0, 12))
    expect(apiKeyPrefix(key)).toHaveLength(12)
    expect(() => apiKeyPrefix('short')).toThrow(/invalid/)
  })

  it('parses Bearer header', () => {
    expect(parseBearer('Bearer sk_abc')).toBe('sk_abc')
    expect(parseBearer(null)).toBeNull()
    expect(parseBearer('Basic x')).toBeNull()
  })
})

describe('password KDF', () => {
  it('hashes with PBKDF2 and verifies', async () => {
    const stored = await hashPassword('demo-password-change-me')
    expect(stored.startsWith(`pbkdf2$${PBKDF2_ITERS}$`)).toBe(true)
    expect(await verifyPassword('demo-password-change-me', stored)).toBe(true)
    expect(await verifyPassword('wrong-password', stored)).toBe(false)
  })

  it('rejects iterations below floor (downgrade)', async () => {
    const good = await hashPassword('secret')
    const parts = good.split('$')
    // pbkdf2$1$salt$hash — weak planted hash
    const weak = `pbkdf2$1$${parts[2]}$${parts[3]}`
    expect(await verifyPassword('secret', weak)).toBe(false)
  })

  it('rejects iterations above max (CPU DoS bound)', async () => {
    const good = await hashPassword('secret')
    const parts = good.split('$')
    const huge = `pbkdf2$${PBKDF2_MAX_ITERS + 1}$${parts[2]}$${parts[3]}`
    expect(await verifyPassword('secret', huge)).toBe(false)
  })

  it('rejects malformed stored hashes', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false)
    expect(await verifyPassword('x', 'pbkdf2$only')).toBe(false)
    expect(await verifyPassword('x', 'sha256$1$ab$cd')).toBe(false)
    expect(await verifyPassword('x', `pbkdf2$${PBKDF2_ITERS}$$deadbeef`)).toBe(false)
  })
})

describe('resolveDualAuth', () => {
  it('returns null without credentials', async () => {
    const r = await resolveDualAuth(null, null, {
      sessions: baPort(null),
      findApiKeyByPrefix: async () => null,
    })
    expect(r).toBeNull()
  })

  it('throws unauthorized for unknown bearer', async () => {
    const key = generateApiKey()
    await expect(
      resolveDualAuth(`Bearer ${key}`, null, {
        sessions: baPort(null),
        findApiKeyByPrefix: async () => null,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('CP-AUTH-DUAL: invalid Bearer fails closed even with valid session', async () => {
    await expect(
      resolveDualAuth('Bearer sk_deadbeef0001', 'kit_session=opaque', {
        sessions: baPort({ id: 'u1', email: 'a@b.c' }),
        findApiKeyByPrefix: async () => null,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('CP-AUTH-DUAL: valid BA session alone succeeds', async () => {
    const r = await resolveDualAuth(null, 'kit_session=x', {
      sessions: baPort({ id: 'u1', email: 'a@b.c' }),
      findApiKeyByPrefix: async () => null,
    })
    expect(r).toMatchObject({ subject: 'u1', method: 'session' })
  })
})

describe('sessionCookieName SSoT', () => {
  it('defaults to kit_session', () => {
    expect(sessionCookieName()).toBe(SESSION_COOKIE)
    expect(sessionCookieName({ name: '  ' })).toBe(SESSION_COOKIE)
  })
  it('accepts override', () => {
    expect(sessionCookieName({ name: 'ba_session' })).toBe('ba_session')
  })
})

describe('SessionPort (Better Auth adapter)', () => {
  it('resolveSession maps getSession user to SessionPayload', async () => {
    const exp = new Date(Date.now() + 3600_000)
    const mockAuth: BetterAuthLike = {
      api: {
        getSession: async () => ({
          user: { id: 'ba-user-1', email: 'ba@kit.local' },
          session: { expiresAt: exp },
        }),
      },
    }
    const port = createBetterAuthSessionPort({ getAuth: () => mockAuth })
    const payload = await port.resolveSession({
      cookieHeader: 'kit_session=opaque',
      cookieName: SESSION_COOKIE,
    })
    expect(payload).toMatchObject({ sub: 'ba-user-1', email: 'ba@kit.local' })
    expect(payload!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('resolveDualAuth works with BA port without secret', async () => {
    const mockAuth: BetterAuthLike = {
      api: {
        getSession: async () => ({
          user: { id: 'ba-2', email: 'x@y.z' },
          session: { expiresAt: new Date(Date.now() + 60_000) },
        }),
      },
    }
    const port = createBetterAuthSessionPort({ getAuth: () => mockAuth })
    const r = await resolveDualAuth(null, 'kit_session=x', {
      sessions: port,
      cookieName: SESSION_COOKIE,
      findApiKeyByPrefix: async () => null,
    })
    expect(r).toMatchObject({ subject: 'ba-2', method: 'session' })
  })

  it('sign throws — BA handler owns issuance', async () => {
    const port = createBetterAuthSessionPort({
      getAuth: () => ({
        api: { getSession: async () => null },
      }),
    })
    await expect(port.sign({ sub: 'u', email: 'a@b.c', exp: 1 }, 'x'.repeat(32))).rejects.toThrow(
      /does not sign/,
    )
  })

  it('resolveSession returns null for missing session / missing expiresAt / expired / throw', async () => {
    const nullPort = createBetterAuthSessionPort({
      getAuth: () => ({ api: { getSession: async () => null } }),
    })
    expect(
      await nullPort.resolveSession({ cookieHeader: 'x=1', cookieName: SESSION_COOKIE }),
    ).toBeNull()

    const noExp = createBetterAuthSessionPort({
      getAuth: () => ({
        api: {
          getSession: async () => ({
            user: { id: 'u', email: 'a@b.c' },
            session: {},
          }),
        },
      }),
    })
    expect(
      await noExp.resolveSession({ cookieHeader: 'x=1', cookieName: SESSION_COOKIE }),
    ).toBeNull()

    const expired = createBetterAuthSessionPort({
      getAuth: () => ({
        api: {
          getSession: async () => ({
            user: { id: 'u', email: 'a@b.c' },
            session: { expiresAt: new Date(Date.now() - 60_000) },
          }),
        },
      }),
    })
    expect(
      await expired.resolveSession({ cookieHeader: 'x=1', cookieName: SESSION_COOKIE }),
    ).toBeNull()

    const throws = createBetterAuthSessionPort({
      getAuth: () => ({
        api: {
          getSession: async () => {
            throw new Error('boom')
          },
        },
      }),
    })
    expect(
      await throws.resolveSession({ cookieHeader: 'x=1', cookieName: SESSION_COOKIE }),
    ).toBeNull()
  })

  it('resolveSession forwards cookie headers into getSession', async () => {
    let seenCookie: string | null = null
    const port = createBetterAuthSessionPort({
      getAuth: () => ({
        api: {
          getSession: async ({ headers }) => {
            seenCookie = headers.get('cookie')
            return {
              user: { id: 'hdr', email: 'h@x.y' },
              session: { expiresAt: new Date(Date.now() + 60_000) },
            }
          },
        },
      }),
    })
    await port.resolveSession({
      cookieHeader: 'kit_session=opaque-token',
      cookieName: SESSION_COOKIE,
    })
    expect(seenCookie).toBe('kit_session=opaque-token')
  })
})

describe('resolveDualAuth cookieName inject', () => {
  it('uses custom cookie name with BA port', async () => {
    const port = baPort({ id: 'cust', email: 'c@d.e' })
    const r = await resolveDualAuth(null, 'my_sess=opaque', {
      cookieName: 'my_sess',
      sessions: port,
      findApiKeyByPrefix: async () => null,
    })
    expect(r).toMatchObject({ subject: 'cust', method: 'session' })
  })
})

describe('session cookie helpers', () => {
  it('sessionCookieHeader sets HttpOnly SameSite Path', () => {
    const h = sessionCookieHeader('tok', { secure: true, maxAge: 60 })
    expect(h).toMatch(/kit_session=tok/)
    expect(h).toMatch(/HttpOnly/)
    expect(h).toMatch(/Secure/)
    expect(h).toMatch(/SameSite=Lax/i)
    expect(h).toMatch(/Max-Age=60/)
  })
  it('clearSessionCookieHeader zeroes Max-Age', () => {
    const h = clearSessionCookieHeader({ secure: false })
    expect(h).toMatch(/Max-Age=0/)
    expect(h).toMatch(/HttpOnly/)
  })
  it('parseCookie extracts name', () => {
    expect(parseCookie('a=1; kit_session=abc; b=2', SESSION_COOKIE)).toBe('abc')
    expect(parseCookie(null, SESSION_COOKIE)).toBeNull()
  })
})

describe('createRequireAuth', () => {
  it('sets subject from BA session and calls next', async () => {
    const mw = createRequireAuth(() => ({
      sessions: baPort({ id: 'req-user', email: 'r@x.y' }),
      findApiKeyByPrefix: async () => null,
    }))
    const store: Record<string, string> = {}
    let nextCalled = false
    await mw(
      {
        req: {
          header: (n: string) => (n.toLowerCase() === 'cookie' ? 'kit_session=x' : undefined),
        },
        set: (k, v) => {
          store[k] = v
        },
      },
      async () => {
        nextCalled = true
      },
    )
    expect(nextCalled).toBe(true)
    expect(store.subject).toBe('req-user')
    expect(store.authMethod).toBe('session')
  })

  it('throws unauthorized without credentials', async () => {
    const mw = createRequireAuth(() => ({
      sessions: baPort(null),
      findApiKeyByPrefix: async () => null,
    }))
    await expect(
      mw(
        {
          req: { header: () => undefined },
          set: () => {},
        },
        async () => {},
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('Bearer valid key wins and sets organizationId', async () => {
    const key = generateApiKey()
    const hash = await hashApiKey(key)
    const mw = createRequireAuth(() => ({
      sessions: baPort({ id: 'ignored' }),
      findApiKeyByPrefix: async () => ({
        subject: 'key-user',
        keyHash: hash,
        revokedAt: null,
        expiresAt: null,
        organizationId: 'org_x',
      }),
    }))
    const store: Record<string, string> = {}
    await mw(
      {
        req: {
          header: (n: string) =>
            n.toLowerCase() === 'authorization' ? `Bearer ${key}` : undefined,
        },
        set: (k, v) => {
          store[k] = v
        },
      },
      async () => {},
    )
    expect(store.subject).toBe('key-user')
    expect(store.authMethod).toBe('api_key')
    expect(store.keyOrganizationId).toBe('org_x')
  })

  it('D11: requireApiKeyOrganization rejects unbound keys (null organizationId)', async () => {
    const key = generateApiKey()
    const hash = await hashApiKey(key)
    await expect(
      resolveDualAuth(`Bearer ${key}`, null, {
        sessions: baPort(null),
        requireApiKeyOrganization: true,
        findApiKeyByPrefix: async () => ({
          subject: 'legacy',
          keyHash: hash,
          revokedAt: null,
          expiresAt: null,
          organizationId: null,
        }),
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('D11: requireApiKeyOrganization off still accepts unbound keys (legacy escape)', async () => {
    const key = generateApiKey()
    const hash = await hashApiKey(key)
    const r = await resolveDualAuth(`Bearer ${key}`, null, {
      sessions: baPort(null),
      requireApiKeyOrganization: false,
      findApiKeyByPrefix: async () => ({
        subject: 'legacy',
        keyHash: hash,
        revokedAt: null,
        expiresAt: null,
        organizationId: null,
      }),
    })
    expect(r).toMatchObject({ subject: 'legacy', method: 'api_key', organizationId: null })
  })
})

describe('BA SessionPort cookie helpers', () => {
  it('cookieHeader and clearCookieHeader honor cookie name override', () => {
    const port = createBetterAuthSessionPort({
      cookieName: 'custom_sess',
      getAuth: () => ({ api: { getSession: async () => null } }),
    })
    const set = port.cookieHeader('tok', { secure: true })
    expect(set).toMatch(/custom_sess=tok/)
    expect(set).toMatch(/Secure/)
    const clear = port.clearCookieHeader({ secure: true })
    expect(clear).toMatch(/custom_sess=/)
    expect(clear).toMatch(/Max-Age=0/)
  })
})
