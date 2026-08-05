import { describe, expect, it } from 'vitest'
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  profileNameSchema,
  resetPasswordSchema,
} from './schemas'

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

describe('profileNameSchema', () => {
  it('rejects empty/whitespace and overlong names', () => {
    expect(profileNameSchema.safeParse({ name: 'Ada' }).success).toBe(true)
    expect(profileNameSchema.safeParse({ name: '  Ada  ' }).success).toBe(true)
    expect(profileNameSchema.safeParse({ name: '' }).success).toBe(false)
    expect(profileNameSchema.safeParse({ name: '   ' }).success).toBe(false)
    expect(profileNameSchema.safeParse({ name: 'x'.repeat(81) }).success).toBe(false)
  })
})
