import { describe, expect, it, vi } from 'vitest'
import {
  assertExactKitTools,
  assertNoShareTools,
  assertToolsMatchAllowlist,
  extractBearerFromEnv,
  handlePing,
  handleWhoami,
  MCP_TOOL_NAMES,
  type WhoamiFetch,
} from './index'

describe('mcp kit', () => {
  it('assertToolsMatchAllowlist is app-driven (not fixed product set)', () => {
    expect(() => assertToolsMatchAllowlist(['ping', 'whoami'], MCP_TOOL_NAMES)).not.toThrow()
    expect(() => assertToolsMatchAllowlist(['whoami', 'ping'], ['ping', 'whoami'])).not.toThrow()
    expect(() => assertToolsMatchAllowlist(['ping', 'whoami', 'extra'], MCP_TOOL_NAMES)).toThrow(
      /exactly/,
    )
    // Product apps may register their own allowlist without package forbidding the names.
    expect(() => assertToolsMatchAllowlist(['alpha', 'beta'], ['alpha', 'beta'])).not.toThrow()
  })

  it('deprecated assertExactKitTools still matches example allowlist', () => {
    expect(() => assertExactKitTools(['ping', 'whoami'])).not.toThrow()
    expect(() => assertExactKitTools(['ping'])).toThrow(/exactly/)
  })

  it('assertNoShareTools only validates identifier shape', () => {
    expect(() => assertNoShareTools(['ping', 'whoami'])).not.toThrow()
    expect(() => assertNoShareTools(['bad name'])).toThrow(/invalid/)
  })

  it('ping works', async () => {
    expect(await handlePing()).toEqual({ ok: true })
  })

  it('extracts API_KEY from env', () => {
    expect(extractBearerFromEnv({ API_KEY: 'sk_test' })).toBe('sk_test')
    expect(extractBearerFromEnv({ API_KEY: 'not-a-key' })).toBeNull()
  })

  it('extracts AUTHORIZATION bare sk_ or Bearer-prefixed without double prefix', () => {
    expect(extractBearerFromEnv({ AUTHORIZATION: 'sk_from_env_bare' })).toBe('sk_from_env_bare')
    expect(extractBearerFromEnv({ AUTHORIZATION: 'Bearer sk_from_env_bearer' })).toBe(
      'sk_from_env_bearer',
    )
  })
})

describe('handleWhoami verify via /api/me', () => {
  const key = 'sk_test_high_entropy_key_material_xxx'

  it('missing key → verified false, no subject', async () => {
    const r = await handleWhoami(null, { apiBaseUrl: 'http://127.0.0.1:8787' })
    expect(r).toEqual({
      keyPresent: false,
      verified: false,
      subject: null,
      status: 'missing_key',
    })
    expect(JSON.stringify(r)).not.toMatch(/sk_/)
  })

  it('missing apiBaseUrl → bad_config (not presence-only success)', async () => {
    const r = await handleWhoami(key)
    expect(r.verified).toBe(false)
    expect(r.status).toBe('bad_config')
    expect(r.subject).toBeNull()
  })

  it('rejects non-allowlisted hosts (SSRF)', async () => {
    const fetch = vi.fn() as unknown as WhoamiFetch
    const r = await handleWhoami(key, {
      apiBaseUrl: 'https://evil.example',
      fetch,
    })
    expect(r.status).toBe('bad_config')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('verified true when /api/me returns subject', async () => {
    const fetch: WhoamiFetch = async (url, init) => {
      expect(url).toBe('http://127.0.0.1:8787/api/me')
      expect(init.headers.authorization).toBe(`Bearer ${key}`)
      return {
        ok: true,
        status: 200,
        async json() {
          return { subject: 'user_demo', authMethod: 'api_key', requestId: 'req_x' }
        },
      }
    }
    const r = await handleWhoami(key, { apiBaseUrl: 'http://127.0.0.1:8787', fetch })
    expect(r).toEqual({
      keyPresent: true,
      verified: true,
      subject: 'user_demo',
      status: 'ok',
    })
    // Never leak key material in tool result
    expect(JSON.stringify(r)).not.toContain(key)
    expect(JSON.stringify(r)).not.toMatch(/sk_test/)
  })

  it('401 → unauthorized, verified false', async () => {
    const fetch: WhoamiFetch = async () => ({
      ok: false,
      status: 401,
      async json() {
        return { error: { code: 'UNAUTHORIZED' } }
      },
    })
    const r = await handleWhoami(key, { apiBaseUrl: 'http://localhost:8787', fetch })
    expect(r.verified).toBe(false)
    expect(r.status).toBe('unauthorized')
    expect(r.subject).toBeNull()
  })

  it('network/abort → unreachable, does not throw', async () => {
    const fetch: WhoamiFetch = async () => {
      throw new Error('ECONNREFUSED')
    }
    const r = await handleWhoami(key, { apiBaseUrl: 'http://127.0.0.1:8787', fetch })
    expect(r).toMatchObject({ verified: false, status: 'unreachable', subject: null })
  })

  it('invalid me body → invalid_response', async () => {
    const fetch: WhoamiFetch = async () => ({
      ok: true,
      status: 200,
      async json() {
        return { notSubject: true }
      },
    })
    const r = await handleWhoami(key, { apiBaseUrl: 'http://127.0.0.1:8787', fetch })
    expect(r.status).toBe('invalid_response')
    expect(r.verified).toBe(false)
  })
})
