import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { assertTrustedOrigins, corsAllowlist } from './better-auth-env'

type MatchesOriginPattern = (url: string, pattern: string) => boolean

async function loadBaMatchesOriginPattern(): Promise<MatchesOriginPattern> {
  const require = createRequire(import.meta.url)
  const file = join(dirname(require.resolve('better-auth')), 'auth/trusted-origins.mjs')
  const mod = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as {
    matchesOriginPattern?: MatchesOriginPattern
  }
  if (typeof mod.matchesOriginPattern !== 'function') {
    throw new Error(`better-auth matchesOriginPattern missing at ${file}`)
  }
  return mod.matchesOriginPattern
}

const matchesOriginPattern = await loadBaMatchesOriginPattern()

/** Probe origins used only to ask BA whether a pattern is a glob, not a denylist. */
const GLOB_PROBES = [
  'https://app.example.com',
  'https://evil.example.com',
  'https://foo.example.com',
  'http://attacker.test',
  'https://a',
  'https://evil.com',
  'https://x.com',
] as const

function baWouldGlob(pattern: string): boolean {
  return GLOB_PROBES.some((probe) => {
    if (probe === pattern) return false
    try {
      if (new URL(probe).origin === pattern) return false
    } catch {
      /* probe is still a valid BA url-or-host sample */
    }
    try {
      return matchesOriginPattern(probe, pattern)
    } catch {
      return false
    }
  })
}

const BA_GLOB_PATTERNS = [
  'https://*',
  'http://*',
  '*.com',
  'https://*.example.com',
  'https://?',
  '*',
] as const

describe('assertTrustedOrigins BA glob oracle', () => {
  it('rejects every pattern Better Auth would glob-match', () => {
    for (const input of BA_GLOB_PATTERNS) {
      expect(baWouldGlob(input), `${input} must be a BA glob`).toBe(true)
      expect(() => assertTrustedOrigins([input])).toThrow()
      expect(() => corsAllowlist({ ENVIRONMENT: 'production', CORS_ORIGINS: input })).toThrow()
    }
  })

  it('allows a concrete origin BA would not glob-match', () => {
    const origin = 'https://app.example.com'
    expect(baWouldGlob(origin)).toBe(false)
    expect(assertTrustedOrigins([origin])).toEqual([origin])
    expect(corsAllowlist({ CORS_ORIGINS: origin })).toEqual([origin])
  })

  it('rejects empty list and null origin string', () => {
    expect(() => assertTrustedOrigins([])).toThrow(/never empty/)
    expect(() => assertTrustedOrigins(['null'])).toThrow(/explicit origins/)
    expect(() => assertTrustedOrigins(['NULL'])).toThrow(/explicit origins/)
    expect(() => corsAllowlist({ CORS_ORIGINS: 'null' })).toThrow(/explicit origins/)
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
  ] as const

  const notLoopback = [
    'https://app.example.com',
    'http://8.8.8.8',
    'http://10.0.0.1',
    'https://localhost.example.com',
  ] as const

  it('rejects 127/8, mapped IPv6, and localhost unless allowLoopback', () => {
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
