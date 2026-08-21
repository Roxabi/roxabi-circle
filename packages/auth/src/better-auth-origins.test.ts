import { describe, expect, it } from 'vitest'
import { assertTrustedOrigins, corsAllowlist } from './better-auth-env'

const GLOB_PATTERNS = [
  'https://*',
  'http://*',
  '*.com',
  'https://*.example.com',
  'https://?',
  '*',
] as const

describe('assertTrustedOrigins glob and null rejection', () => {
  it('rejects glob patterns (https://*, *.com, *, https://?)', () => {
    for (const input of GLOB_PATTERNS) {
      expect(() => assertTrustedOrigins([input]), input).toThrow(/glob|\*/)
      expect(
        () => corsAllowlist({ ENVIRONMENT: 'production', CORS_ORIGINS: input }),
        input,
      ).toThrow(/glob|\*/)
    }
  })

  it('allows a concrete origin', () => {
    const origin = 'https://app.example.com'
    expect(assertTrustedOrigins([origin])).toEqual([origin])
    expect(corsAllowlist({ CORS_ORIGINS: origin })).toEqual([origin])
  })

  it('rejects empty list and null origin string', () => {
    expect(() => assertTrustedOrigins([])).toThrow(/never empty/)
    expect(() => assertTrustedOrigins(['null'])).toThrow(/null/)
    expect(() => assertTrustedOrigins(['NULL'])).toThrow(/null/)
    expect(() => corsAllowlist({ CORS_ORIGINS: 'null' })).toThrow(/null/)
  })
})

describe('assertTrustedOrigins loopback classifier', () => {
  const loopback = [
    'http://127.0.0.1',
    'http://127.0.0.2:5173',
    'http://127.255.255.255',
    'http://localhost:5173',
    'http://app.localhost:5173',
    'http://[::1]:5173',
    'http://[::ffff:7f00:1]',
    'http://[::ffff:7f00:2]:5173',
    'http://localhost.',
    'http://127.0.0.1.',
    'http://0.0.0.0',
    'http://0.0.0.0:5173',
    'http://[::]',
    'http://[::]:5173',
  ] as const

  const notLoopback = [
    'https://app.example.com',
    'http://8.8.8.8',
    'http://10.0.0.1',
    'https://localhost.example.com',
  ] as const

  it('rejects 127/8, mapped IPv6, localhost, trailing-dot FQDN, and unspecified unless allowLoopback', () => {
    for (const origin of loopback) {
      expect(() => assertTrustedOrigins([origin])).toThrow(/loopback/)
      expect(assertTrustedOrigins([origin], { allowLoopback: true })).toEqual([origin])
    }
  })

  it('does not treat public or RFC1918 hosts as loopback', () => {
    for (const origin of notLoopback) {
      expect(assertTrustedOrigins([origin])).toEqual([origin])
    }
  })

  it('corsAllowlist still requires allowLoopback via development|test', () => {
    expect(() =>
      corsAllowlist({ ENVIRONMENT: 'production', CORS_ORIGINS: 'http://127.0.0.2:5173' }),
    ).toThrow(/loopback/)
    expect(
      corsAllowlist({ ENVIRONMENT: 'development', CORS_ORIGINS: 'http://127.0.0.2:5173' }),
    ).toEqual(['http://127.0.0.2:5173'])
  })
})
