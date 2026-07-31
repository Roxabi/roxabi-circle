import { describe, expect, it } from 'vitest'
import { forgotPasswordSchema, loginSchema, resetPasswordSchema } from './schemas'

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true)
  })

  it('rejects bad email / empty password', () => {
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false)
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false)
  })
})

describe('forgotPasswordSchema', () => {
  it('requires email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@b.co' }).success).toBe(true)
    expect(forgotPasswordSchema.safeParse({ email: 'x' }).success).toBe(false)
  })
})

describe('resetPasswordSchema', () => {
  it('requires min 8 and matching confirm', () => {
    expect(
      resetPasswordSchema.safeParse({ password: '12345678', confirm: '12345678' }).success,
    ).toBe(true)
    expect(resetPasswordSchema.safeParse({ password: 'short', confirm: 'short' }).success).toBe(
      false,
    )
    expect(
      resetPasswordSchema.safeParse({ password: '12345678', confirm: '87654321' }).success,
    ).toBe(false)
  })
})
