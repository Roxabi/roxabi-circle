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
import { resolveDualAuth } from './require-auth'
import { SESSION_COOKIE, signSession, verifySession } from './session'
import { createHmacSessionPort, defaultSessionPort } from './session-port'

function b64urlJson(obj: unknown): string {
  const json = JSON.stringify(obj)
  const bin = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return bin
}

async function forgeSignedBody(bodyB64: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(bodyB64))
  const bytes = new Uint8Array(sig)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  const sigB64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${bodyB64}.${sigB64}`
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

describe('session cookie', () => {
  const secret = 'test-secret-at-least-32-characters!!'

  it('signs and verifies', async () => {
    const token = await signSession(
      { sub: 'u1', email: 'a@b.c', exp: Math.floor(Date.now() / 1000) + 3600 },
      secret,
    )
    const payload = await verifySession(token, secret)
    expect(payload?.sub).toBe('u1')
    expect(payload?.email).toBe('a@b.c')
  })

  it('rejects bad signature', async () => {
    const token = await signSession(
      { sub: 'u1', email: 'a@b.c', exp: Math.floor(Date.now() / 1000) + 3600 },
      secret,
    )
    expect(await verifySession(token, 'other-secret-at-least-32-chars!!!!')).toBeNull()
  })

  it('rejects expired sessions', async () => {
    const token = await signSession(
      { sub: 'u1', email: 'a@b.c', exp: Math.floor(Date.now() / 1000) - 10 },
      secret,
    )
    expect(await verifySession(token, secret)).toBeNull()
  })

  it('rejects missing exp (no immortal sessions)', async () => {
    const body = b64urlJson({ sub: 'u1', email: 'a@b.c' })
    const token = await forgeSignedBody(body, secret)
    expect(await verifySession(token, secret)).toBeNull()
  })

  it('rejects non-finite exp', async () => {
    const body = b64urlJson({ sub: 'u1', email: 'a@b.c', exp: Number.NaN })
    const token = await forgeSignedBody(body, secret)
    expect(await verifySession(token, secret)).toBeNull()
  })

  it('rejects empty sub', async () => {
    const body = b64urlJson({
      sub: '',
      email: 'a@b.c',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    const token = await forgeSignedBody(body, secret)
    expect(await verifySession(token, secret)).toBeNull()
  })

  it('rejects garbage token without throwing', async () => {
    expect(await verifySession('', secret)).toBeNull()
    expect(await verifySession('not.a.valid.token!!', secret)).toBeNull()
    expect(await verifySession('onlyonepart', secret)).toBeNull()
  })

  it('rejects wrong payload types', async () => {
    const body = b64urlJson({
      sub: 1,
      email: 'a@b.c',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    const token = await forgeSignedBody(body, secret)
    expect(await verifySession(token, secret)).toBeNull()
  })
})

describe('resolveDualAuth', () => {
  it('returns null without credentials', async () => {
    const { resolveDualAuth } = await import('./require-auth')
    const r = await resolveDualAuth(null, null, {
      secret: 'x'.repeat(32),
      findApiKeyByPrefix: async () => null,
    })
    expect(r).toBeNull()
  })

  it('throws unauthorized for unknown bearer', async () => {
    const { resolveDualAuth } = await import('./require-auth')
    const key = generateApiKey()
    await expect(
      resolveDualAuth(`Bearer ${key}`, null, {
        secret: 'x'.repeat(32),
        findApiKeyByPrefix: async () => null,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('CP-AUTH-DUAL: invalid Bearer fails closed even with valid session cookie', async () => {
    const { resolveDualAuth } = await import('./require-auth')
    const secret = 'test-secret-at-least-32-characters!!'
    const token = await signSession(
      { sub: 'u1', email: 'a@b.c', exp: Math.floor(Date.now() / 1000) + 3600 },
      secret,
    )
    const cookie = `${SESSION_COOKIE}=${token}`
    await expect(
      resolveDualAuth('Bearer sk_deadbeef0001', cookie, {
        secret,
        findApiKeyByPrefix: async () => null,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('CP-AUTH-DUAL: valid session cookie alone succeeds', async () => {
    const { resolveDualAuth } = await import('./require-auth')
    const secret = 'test-secret-at-least-32-characters!!'
    const token = await signSession(
      { sub: 'u1', email: 'a@b.c', exp: Math.floor(Date.now() / 1000) + 3600 },
      secret,
    )
    const r = await resolveDualAuth(null, `${SESSION_COOKIE}=${token}`, {
      secret,
      findApiKeyByPrefix: async () => null,
    })
    expect(r).toMatchObject({ subject: 'u1', method: 'session' })
  })
})

describe('SessionPort (HMAC adapter)', () => {
  const secret = 'test-secret-at-least-32-characters!!'

  it('createHmacSessionPort signs and verifies via port surface', async () => {
    const port = createHmacSessionPort()
    const token = await port.sign(
      { sub: 'u1', email: 'a@b.c', exp: Math.floor(Date.now() / 1000) + 3600 },
      secret,
    )
    const payload = await port.verify(token, secret)
    expect(payload?.sub).toBe('u1')
    const set = port.cookieHeader(token, { secure: true })
    expect(set).toMatch(/HttpOnly/)
    expect(set).toMatch(/Secure/)
    expect(set).toMatch(/SameSite=Lax/i)
    expect(set).toMatch(/Path=\//)
    const clear = port.clearCookieHeader({ secure: true })
    expect(clear).toMatch(/Max-Age=0/)
    expect(clear).toMatch(/HttpOnly/)
    expect(clear).toMatch(/SameSite=Lax/i)
  })

  it('rejects short session secrets', async () => {
    await expect(
      signSession({ sub: 'u', email: 'a@b.c', exp: Math.floor(Date.now() / 1000) + 60 }, 'short'),
    ).rejects.toThrow(/at least 32/)
  })

  it('defaultSessionPort is the HMAC adapter', async () => {
    const token = await defaultSessionPort.sign(
      { sub: 'u2', email: 'x@y.z', exp: Math.floor(Date.now() / 1000) + 60 },
      secret,
    )
    expect(await defaultSessionPort.verify(token, secret)).toMatchObject({ sub: 'u2' })
  })

  it('resolveSession reads cookieName + secret', async () => {
    const port = createHmacSessionPort()
    const token = await port.sign(
      { sub: 'u3', email: 'c@d.e', exp: Math.floor(Date.now() / 1000) + 3600 },
      secret,
    )
    const ok = await port.resolveSession({
      cookieHeader: `${SESSION_COOKIE}=${token}`,
      secret,
      cookieName: SESSION_COOKIE,
    })
    expect(ok?.sub).toBe('u3')
    const miss = await port.resolveSession({
      cookieHeader: `other=${token}`,
      secret,
      cookieName: SESSION_COOKIE,
    })
    expect(miss).toBeNull()
  })
})

describe('sessionCookieName SSoT', () => {
  it('defaults to gosilex_session', () => {
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
          user: { id: 'ba-user-1', email: 'ba@gosilex.local' },
          session: { expiresAt: exp },
        }),
      },
    }
    const port = createBetterAuthSessionPort({ getAuth: () => mockAuth })
    const payload = await port.resolveSession({
      cookieHeader: 'gosilex_session=opaque',
      cookieName: SESSION_COOKIE,
    })
    expect(payload).toMatchObject({ sub: 'ba-user-1', email: 'ba@gosilex.local' })
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
    const r = await resolveDualAuth(null, 'gosilex_session=x', {
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
})

describe('resolveDualAuth cookieName inject', () => {
  it('uses custom cookie name with HMAC port', async () => {
    const secret = 'test-secret-at-least-32-characters!!'
    const port = createHmacSessionPort()
    const token = await port.sign(
      { sub: 'cust', email: 'c@d.e', exp: Math.floor(Date.now() / 1000) + 3600 },
      secret,
    )
    const r = await resolveDualAuth(null, `my_sess=${token}`, {
      secret,
      cookieName: 'my_sess',
      sessions: port,
      findApiKeyByPrefix: async () => null,
    })
    expect(r).toMatchObject({ subject: 'cust', method: 'session' })
  })
})
