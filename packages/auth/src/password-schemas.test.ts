import { describe, expect, it } from 'vitest'
import { changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from './password-schemas'

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

describe('changePasswordSchema', () => {
  it('requires current, min 8 new, and matching confirm', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'oldpass1',
        newPassword: '12345678',
        confirm: '12345678',
      }).success,
    ).toBe(true)
    expect(
      changePasswordSchema.safeParse({
        currentPassword: '',
        newPassword: '12345678',
        confirm: '12345678',
      }).success,
    ).toBe(false)
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'oldpass1',
        newPassword: 'short',
        confirm: 'short',
      }).success,
    ).toBe(false)
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'oldpass1',
        newPassword: '12345678',
        confirm: '87654321',
      }).success,
    ).toBe(false)
  })
})
