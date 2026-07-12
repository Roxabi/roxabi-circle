import { describe, expect, it } from 'vitest'
import { ErrorCode } from './index'

describe('ErrorCode', () => {
  it('exposes kit-generic codes only', () => {
    expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED')
    expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR')
    expect(Object.values(ErrorCode).every((c) => !c.includes('SHARE'))).toBe(true)
  })
})
