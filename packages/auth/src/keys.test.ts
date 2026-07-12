import { describe, expect, it } from 'vitest'
import {
  generateApiKey,
  hashApiKey,
  hashPassword,
  parseBearer,
  verifyApiKey,
  verifyPassword,
} from './keys'
import { signSession, verifySession } from './session'

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
    expect(stored.startsWith('pbkdf2$')).toBe(true)
    expect(await verifyPassword('demo-password-change-me', stored)).toBe(true)
    expect(await verifyPassword('wrong-password', stored)).toBe(false)
  })
})

describe('session cookie', () => {
  it('signs and verifies', async () => {
    const secret = 'test-secret-at-least-32-characters!!'
    const token = await signSession(
      { sub: 'u1', email: 'a@b.c', exp: Math.floor(Date.now() / 1000) + 3600 },
      secret,
    )
    const payload = await verifySession(token, secret)
    expect(payload?.sub).toBe('u1')
    expect(payload?.email).toBe('a@b.c')
  })

  it('rejects bad signature', async () => {
    const secret = 'test-secret-at-least-32-characters!!'
    const token = await signSession(
      { sub: 'u1', email: 'a@b.c', exp: Math.floor(Date.now() / 1000) + 3600 },
      secret,
    )
    expect(await verifySession(token, 'other-secret-at-least-32-chars!!!!')).toBeNull()
  })

  it('rejects expired sessions', async () => {
    const secret = 'test-secret-at-least-32-characters!!'
    const token = await signSession(
      { sub: 'u1', email: 'a@b.c', exp: Math.floor(Date.now() / 1000) - 10 },
      secret,
    )
    expect(await verifySession(token, secret)).toBeNull()
  })
})
