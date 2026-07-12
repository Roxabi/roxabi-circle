import { describe, expect, it } from 'vitest'
import {
  generateApiKey,
  hashApiKey,
  hashPassword,
  PBKDF2_ITERS,
  PBKDF2_MAX_ITERS,
  parseBearer,
  verifyApiKey,
  verifyPassword,
} from './keys'
import { signSession, verifySession } from './session'

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
