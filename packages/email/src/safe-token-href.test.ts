import { describe, expect, it } from 'vitest'
import { isLoopbackHost } from './loopback-host'
import { assertSafeTokenHref } from './safe-token-href'

const EMPTY = { allowedOrigins: [] as const }

describe('assertSafeTokenHref', () => {
  it('rejects loopback unless allowLoopbackHttp is true', () => {
    expect(() =>
      assertSafeTokenHref('http://localhost:8787/api/auth/magic-link/verify?token=abc', EMPTY),
    ).toThrow(/EMAIL_TOKEN_HREF_INVALID/)
    expect(
      assertSafeTokenHref('http://localhost:8787/api/auth/magic-link/verify?token=abc', {
        allowedOrigins: [],
        allowLoopbackHttp: true,
      }),
    ).toContain('localhost')
    expect(
      assertSafeTokenHref('http://127.0.0.1:5173/invite/accept?invitationId=inv_x', {
        allowedOrigins: [],
        allowLoopbackHttp: true,
      }),
    ).toContain('127.0.0.1')
  })

  it('rejects javascript, data, and off-origin https', () => {
    expect(() => assertSafeTokenHref('javascript:alert(1)', EMPTY)).toThrow(
      /EMAIL_TOKEN_HREF_INVALID/,
    )
    expect(() => assertSafeTokenHref('data:text/html,x', EMPTY)).toThrow(/EMAIL_TOKEN_HREF_INVALID/)
    expect(() => assertSafeTokenHref('https://evil.test/steal', EMPTY)).toThrow(
      /EMAIL_TOKEN_HREF_INVALID/,
    )
    expect(() => assertSafeTokenHref('http://evil.test/steal', EMPTY)).toThrow(
      /EMAIL_TOKEN_HREF_INVALID/,
    )
  })

  it('allows https only when the origin is listed', () => {
    const url = 'https://app.example.com/reset-password?token=abc'
    expect(assertSafeTokenHref(url, { allowedOrigins: ['https://app.example.com'] })).toBe(url)
    expect(() =>
      assertSafeTokenHref(url, { allowedOrigins: ['https://other.example.com'] }),
    ).toThrow(/EMAIL_TOKEN_HREF_INVALID/)
    expect(() =>
      assertSafeTokenHref('https://app.example.com.evil.test/x', {
        allowedOrigins: ['https://app.example.com'],
      }),
    ).toThrow(/EMAIL_TOKEN_HREF_INVALID/)
  })

  it('rejects listed non-loopback http (token links must be https or loopback)', () => {
    expect(() =>
      assertSafeTokenHref('http://app.example.com/reset', {
        allowedOrigins: ['http://app.example.com'],
      }),
    ).toThrow(/EMAIL_TOKEN_HREF_INVALID/)
  })

  it('allows listed loopback http without the allowLoopbackHttp flag', () => {
    const url = 'http://localhost:5173/invite/accept?invitationId=inv_x'
    expect(assertSafeTokenHref(url, { allowedOrigins: ['http://localhost:5173'] })).toBe(url)
  })

  it('rejects userinfo and control characters', () => {
    const withUserinfo = new URL('https://app.example.com/x')
    withUserinfo.username = 'alice'
    withUserinfo.password = 'secret'
    expect(() =>
      assertSafeTokenHref(withUserinfo.href, {
        allowedOrigins: ['https://app.example.com'],
      }),
    ).toThrow(/EMAIL_TOKEN_HREF_INVALID/)
    expect(() =>
      assertSafeTokenHref('http://localhost:8787/x\r\nBcc: x', {
        allowedOrigins: [],
        allowLoopbackHttp: true,
      }),
    ).toThrow(/EMAIL_TOKEN_HREF_INVALID/)
  })

  it('classifies RFC 6761 .localhost as loopback', () => {
    expect(isLoopbackHost('web.localhost')).toBe(true)
    expect(
      assertSafeTokenHref('http://web.localhost:5173/invite', {
        allowedOrigins: [],
        allowLoopbackHttp: true,
      }),
    ).toContain('web.localhost')
  })
})
