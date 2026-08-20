import { AppError } from '@kit/core'
import { describe, expect, it, vi } from 'vitest'
import { MAGIC_LINK_EXPIRES_IN_SEC, RESET_PASSWORD_TOKEN_EXPIRES_IN_SEC } from './auth-email'
import { getBetterAuthSecret } from './better-auth-env'
import { createBetterAuth } from './better-auth-factory'
import { betterAuthDrizzleSchema } from './better-auth-schema'

const SECRET = 'test-better-auth-secret-xxxxxxxx32c!!'

type BaAuth = ReturnType<typeof createBetterAuth> & {
  options: {
    emailAndPassword?: {
      disableSignUp?: boolean
      resetPasswordTokenExpiresIn?: number
      sendResetPassword?: (i: { user: { email: string }; url: string }) => Promise<void>
    }
    advanced?: {
      useSecureCookies?: boolean
      cookies?: { session_token?: unknown }
    }
    plugins?: { id: string; options?: Record<string, unknown> }[]
  }
}

function factory(overrides: Partial<Parameters<typeof createBetterAuth>[0]> = {}): BaAuth {
  return createBetterAuth({
    database: {},
    secret: SECRET,
    baseURL: 'http://localhost:8787',
    trustedOrigins: ['http://localhost:5173'],
    emailPort: { send: vi.fn(async () => ({ ok: true, transport: 'log' })) },
    schema: betterAuthDrizzleSchema,
    ...overrides,
  }) as BaAuth
}

describe('createBetterAuth', () => {
  it('fail-closed defaults: signup off, secure cookies, kit TTLs, org+magic plugins', () => {
    const send = vi.fn(async () => ({ ok: true, transport: 'log' }))
    const auth = factory({ emailPort: { send } })
    expect(auth.options.emailAndPassword?.disableSignUp).toBe(true)
    expect(auth.options.emailAndPassword?.resetPasswordTokenExpiresIn).toBe(
      RESET_PASSWORD_TOKEN_EXPIRES_IN_SEC,
    )
    expect(auth.options.advanced?.useSecureCookies).toBe(true)
    expect(auth.options.advanced?.cookies?.session_token).toEqual({
      name: 'kit_session',
      attributes: { httpOnly: true, sameSite: 'lax', path: '/', secure: true },
    })
    const ids = auth.options.plugins?.map((p: { id: string }) => p.id)
    expect(ids).toEqual(['organization', 'magic-link'])
    const magic = auth.options.plugins?.find((p: { id: string }) => p.id === 'magic-link') as {
      options?: { expiresIn?: number; disableSignUp?: boolean }
    }
    expect(magic?.options?.expiresIn).toBe(MAGIC_LINK_EXPIRES_IN_SEC)
    expect(magic?.options?.disableSignUp).toBe(true)
    expect(send).not.toHaveBeenCalled()
  })

  it('allowPublicSignup true enables password + magic-link sign-up', () => {
    const auth = factory({ allowPublicSignup: true })
    expect(auth.options.emailAndPassword?.disableSignUp).toBe(false)
    const magic = auth.options.plugins?.find((p: { id: string }) => p.id === 'magic-link') as {
      options?: { disableSignUp?: boolean }
    }
    expect(magic?.options?.disableSignUp).toBe(false)
  })

  it('rejects short and kit-placeholder secrets', () => {
    expect(() => factory({ secret: 'short' })).toThrow(AppError)
    expect(() => factory({ secret: 'dev-better-auth-secret-change-me-32c!!' })).toThrow(AppError)
  })

  it('accepts kit placeholder only when allowKitPlaceholderSecret is set', () => {
    const secret = getBetterAuthSecret({ ENVIRONMENT: 'development' })
    expect(() => factory({ secret })).toThrow(AppError)
    const auth = factory({ secret, allowKitPlaceholderSecret: true })
    expect(typeof auth.handler).toBe('function')
  })

  it('invokes emailPort.send from reset + magic handlers', async () => {
    const send = vi.fn(async () => ({ ok: true, transport: 'log' }))
    const auth = factory({ emailPort: { send } })
    await auth.options.emailAndPassword?.sendResetPassword?.({
      user: { email: 'a@b.c' },
      url: 'http://localhost:8787/api/auth/reset-password/tok',
    } as never)
    const magic = auth.options.plugins?.find((p: { id: string }) => p.id === 'magic-link') as {
      options?: { sendMagicLink?: (i: { email: string; url: string }) => Promise<void> }
    }
    await magic?.options?.sendMagicLink?.({
      email: 'a@b.c',
      url: 'http://localhost:8787/api/auth/magic-link/verify?token=x',
    })
    expect(send).toHaveBeenCalledTimes(2)
  })
})
