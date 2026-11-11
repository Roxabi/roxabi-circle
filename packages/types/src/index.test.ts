import { describe, expect, it } from 'vitest'
import { ErrorCode, type FieldErrors, type ValidationDetails } from './index'

describe('ErrorCode', () => {
  it('exposes kit-generic codes only', () => {
    expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED')
    expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR')
    expect(Object.values(ErrorCode).every((c) => !c.includes('SHARE'))).toBe(true)
  })
})

describe('ValidationDetails', () => {
  it('FieldErrors nests under fieldErrors', () => {
    const fieldErrors: FieldErrors = { email: ['Required'], note: undefined }
    const details: ValidationDetails = { fieldErrors }
    expect(details.fieldErrors.email).toEqual(['Required'])
  })
})
