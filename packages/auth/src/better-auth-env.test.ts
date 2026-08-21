import { AppError } from '@kit/core'
import { describe, expect, it } from 'vitest'
import {
  allowPublicSignup,
  assertBetterAuthConfigured,
  assertTrustedOrigins,
  betterAuthBaseURL,
  corsAllowlist,
  environmentName,
  getBetterAuthSecret,
  getSessionSecret,
  isDevLikeEnvironment,
  sessionCookieNameFromEnv,
  useSecureCookie,
} from './better-auth-env'

describe('better-auth env helpers', () => {
  it('treats missing ENVIRONMENT as non-dev (fail-closed)', () => {
    expect(environmentName({})).toBeUndefined()
    expect(isDevLikeEnvironment({})).toBe(false)
    expect(useSecureCookie({})).toBe(true)
  })

  it('recognizes explicit development|test', () => {
    expect(isDevLikeEnvironment({ ENVIRONMENT: 'development' })).toBe(true)
    expect(isDevLikeEnvironment({ ENVIRONMENT: 'TEST' })).toBe(true)
    expect(useSecureCookie({ ENVIRONMENT: 'development' })).toBe(false)
  })

  it('parses CORS allowlist — localhost default only in development|test', () => {
    expect(corsAllowlist({ ENVIRONMENT: 'development' })).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ])
    expect(corsAllowlist({ CORS_ORIGINS: ' https://app.example.com , ' })).toEqual([
      'https://app.example.com',
    ])
  })

  it('fails closed on missing CORS_ORIGINS and on * / null / loopback', () => {
    expect(() => corsAllowlist({})).toThrow(AppError)
    expect(() => corsAllowlist({ ENVIRONMENT: 'production' })).toThrow(/CORS_ORIGINS/)
    expect(() => corsAllowlist({ ENVIRONMENT: 'development', CORS_ORIGINS: '*' })).toThrow(
      /explicit origins/,
    )
    expect(() => corsAllowlist({ ENVIRONMENT: 'test', CORS_ORIGINS: 'NULL' })).toThrow(
      /explicit origins/,
    )
    expect(() =>
      corsAllowlist({
        ENVIRONMENT: 'production',
        CORS_ORIGINS: 'https://app.example.com,*',
      }),
    ).toThrow(/explicit origins/)
    expect(() =>
      corsAllowlist({ ENVIRONMENT: 'production', CORS_ORIGINS: 'http://localhost:5173' }),
    ).toThrow(/loopback/)
    expect(() =>
      corsAllowlist({
        ENVIRONMENT: 'staging',
        CORS_ORIGINS: 'https://app.example.com,http://127.0.0.1:5173',
      }),
    ).toThrow(/loopback/)
    expect(() => corsAllowlist({ ENVIRONMENT: 'production', CORS_ORIGINS: 'https://*' })).toThrow(
      /glob/,
    )
  })

  it('assertTrustedOrigins rejects * / globs / null / empty and loopback by default', () => {
    expect(() => assertTrustedOrigins(['*'])).toThrow(/explicit origins/)
    expect(() => assertTrustedOrigins(['https://*'])).toThrow(/glob/)
    expect(() => assertTrustedOrigins(['https://*.example.com'])).toThrow(/glob/)
    expect(() => assertTrustedOrigins(['*.example.com'])).toThrow(/glob/)
    expect(() => assertTrustedOrigins(['NULL'])).toThrow(/explicit origins/)
    expect(() => assertTrustedOrigins([])).toThrow(/never empty/)
    expect(() => assertTrustedOrigins(['https://app.example.com/app'])).toThrow(/no path/)
    expect(() => assertTrustedOrigins(['http://localhost:5173'])).toThrow(/loopback/)
    expect(() => assertTrustedOrigins(['http://127.0.0.2:5173'])).toThrow(/loopback/)
    expect(() => assertTrustedOrigins(['http://[::1]:5173'])).toThrow(/loopback/)
    expect(() => assertTrustedOrigins(['http://[::ffff:7f00:2]:5173'])).toThrow(/loopback/)
    expect(() =>
      assertTrustedOrigins(['https://app.example.com', 'http://localhost:5173']),
    ).toThrow(/loopback/)
    expect(assertTrustedOrigins(['https://app.example.com'], { allowLoopback: false })).toEqual([
      'https://app.example.com',
    ])
    expect(assertTrustedOrigins(['http://localhost:5173'], { allowLoopback: true })).toEqual([
      'http://localhost:5173',
    ])
  })

  it('public signup is off unless exactly true', () => {
    expect(allowPublicSignup({})).toBe(false)
    expect(allowPublicSignup({ ALLOW_PUBLIC_SIGNUP: 'yes' })).toBe(false)
    expect(allowPublicSignup({ ALLOW_PUBLIC_SIGNUP: 'true' })).toBe(true)
  })

  it('session cookie name falls back to kit default', () => {
    expect(sessionCookieNameFromEnv({})).toBe('kit_session')
    expect(sessionCookieNameFromEnv({ SESSION_COOKIE_NAME: 'lgu_session' })).toBe('lgu_session')
  })

  it('dev fallbacks for unset secrets', () => {
    const env = { ENVIRONMENT: 'development' }
    expect(getSessionSecret(env).length).toBeGreaterThanOrEqual(32)
    expect(getBetterAuthSecret(env).length).toBeGreaterThanOrEqual(32)
  })

  it('rejects short and placeholder secrets outside dev', () => {
    expect(() => getBetterAuthSecret({})).toThrow(AppError)
    expect(() => getBetterAuthSecret({ ENVIRONMENT: 'production' })).toThrow(/BETTER_AUTH_SECRET/)
    expect(() => getBetterAuthSecret({ BETTER_AUTH_SECRET: 'short' })).toThrow(AppError)
    expect(() =>
      getBetterAuthSecret({
        ENVIRONMENT: 'production',
        BETTER_AUTH_SECRET: 'dev-better-auth-secret-change-me-32c!!',
      }),
    ).toThrow(AppError)
    expect(() =>
      getSessionSecret({
        ENVIRONMENT: 'production',
        SESSION_SECRET: 'change-me-session-secret-min-32-chars!!',
      }),
    ).toThrow(AppError)
    expect(() => getSessionSecret({ ENVIRONMENT: 'production' })).toThrow(AppError)
  })

  it('assertBetterAuthConfigured requires URL outside dev', () => {
    expect(() =>
      assertBetterAuthConfigured({
        ENVIRONMENT: 'production',
        BETTER_AUTH_SECRET: 'x'.repeat(32),
      }),
    ).toThrow(AppError)
    expect(() =>
      assertBetterAuthConfigured({
        ENVIRONMENT: 'production',
        BETTER_AUTH_SECRET: 'x'.repeat(32),
        BETTER_AUTH_URL: 'https://api.example.com',
      }),
    ).not.toThrow()
  })

  it('betterAuthBaseURL prefers configured URL and strips trailing slash', () => {
    expect(
      betterAuthBaseURL({ BETTER_AUTH_URL: 'https://api.example.com/' }, 'http://localhost:8787/x'),
    ).toBe('https://api.example.com')
  })

  it('betterAuthBaseURL uses request origin in dev and fails closed otherwise', () => {
    expect(
      betterAuthBaseURL({ ENVIRONMENT: 'development' }, 'http://127.0.0.1:8787/api/auth'),
    ).toBe('http://127.0.0.1:8787')
    expect(betterAuthBaseURL({ ENVIRONMENT: 'development' }, 'not a url')).toBe(
      'http://localhost:8787',
    )
    expect(() => betterAuthBaseURL({ ENVIRONMENT: 'production' }, 'http://x')).toThrow(
      /BETTER_AUTH_URL/,
    )
  })
})
