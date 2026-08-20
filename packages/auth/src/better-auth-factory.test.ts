import { describe, expect, it, vi } from 'vitest'
import { MAGIC_LINK_EXPIRES_IN_SEC, RESET_PASSWORD_TOKEN_EXPIRES_IN_SEC } from './auth-email'
import { createBetterAuth } from './better-auth-factory'
import { betterAuthDrizzleSchema } from './better-auth-schema'

describe('createBetterAuth', () => {
  it('exports kit TTL defaults (5 min magic / 1 h reset)', () => {
    expect(MAGIC_LINK_EXPIRES_IN_SEC).toBe(300)
    expect(RESET_PASSWORD_TOKEN_EXPIRES_IN_SEC).toBe(3600)
  })

  it('returns handler + getSession without hitting D1 or sending mail', () => {
    const send = vi.fn(async () => ({ ok: true, transport: 'log' }))
    const auth = createBetterAuth({
      database: {},
      secret: 'test-better-auth-secret-change-me-32c!!',
      baseURL: 'http://localhost:8787',
      trustedOrigins: ['http://localhost:5173'],
      emailPort: { send },
      useSecureCookies: false,
      schema: betterAuthDrizzleSchema,
    })
    expect(typeof auth.handler).toBe('function')
    expect(typeof auth.api.getSession).toBe('function')
    expect(send).not.toHaveBeenCalled()
  })
})
