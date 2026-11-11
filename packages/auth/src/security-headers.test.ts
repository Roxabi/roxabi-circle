import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { BetterAuthEnvSlice } from './better-auth-env'
import { applySecurityHeaders, securityHeaders } from './security-headers'

describe('securityHeaders', () => {
  it('sets baseline headers including frame-ancestors', async () => {
    const h = new Hono<{ Bindings: BetterAuthEnvSlice }>()
    h.use('*', securityHeaders)
    h.get('/', (c) => c.json({ ok: true }))
    const res = await h.request('/', {}, { ENVIRONMENT: 'test' })
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
    expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'")
    expect(res.headers.get('Strict-Transport-Security')).toBeNull()
  })

  it('sets HSTS when cookies are Secure (non-dev)', () => {
    const headers = new Map<string, string>()
    applySecurityHeaders({
      header: (name, value) => {
        headers.set(name, value)
      },
      env: { ENVIRONMENT: 'production' },
    })
    expect(headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains')
  })
})
