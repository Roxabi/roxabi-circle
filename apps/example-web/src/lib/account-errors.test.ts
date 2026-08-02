import { describe, expect, it } from 'vitest'
import { en } from '../messages/en'
import { changePasswordErrorMessage, profileErrorMessage } from './account-errors'
import { ApiError } from './api'

function apiErr(status: number, code: string): ApiError {
  return new ApiError(status, {
    error: { code, message: 'wire' },
    requestId: 'req_test',
  })
}

describe('changePasswordErrorMessage', () => {
  it('maps 401 / UNAUTHORIZED → reauth', () => {
    expect(changePasswordErrorMessage(apiErr(401, 'UNAUTHORIZED'), en)).toBe(
      en.changePasswordReauth,
    )
    expect(changePasswordErrorMessage(new Error('HTTP 401'), en)).toBe(en.changePasswordReauth)
  })

  it('maps 400 → wrong current password', () => {
    expect(changePasswordErrorMessage(apiErr(400, 'VALIDATION_ERROR'), en)).toBe(
      en.changePasswordWrong,
    )
    expect(changePasswordErrorMessage(new Error('HTTP 400'), en)).toBe(en.changePasswordWrong)
  })

  it('maps 403 → reauth (not wrong password)', () => {
    expect(changePasswordErrorMessage(apiErr(403, 'FORBIDDEN'), en)).toBe(en.changePasswordReauth)
    expect(changePasswordErrorMessage(new Error('HTTP 403'), en)).toBe(en.changePasswordReauth)
  })

  it('maps 429 → rate limited', () => {
    expect(changePasswordErrorMessage(apiErr(429, 'RATE_LIMITED'), en)).toBe(en.errRateLimited)
    expect(changePasswordErrorMessage(new Error('HTTP 429'), en)).toBe(en.errRateLimited)
  })
})

describe('profileErrorMessage', () => {
  it('never returns change-password copy', () => {
    const cases: unknown[] = [
      apiErr(400, 'VALIDATION_ERROR'),
      apiErr(401, 'UNAUTHORIZED'),
      apiErr(403, 'FORBIDDEN'),
      new Error('HTTP 400'),
      new Error('HTTP 401'),
    ]
    for (const err of cases) {
      const msg = profileErrorMessage(err, en)
      expect(msg).not.toBe(en.changePasswordWrong)
      expect(msg).not.toBe(en.changePasswordReauth)
    }
  })

  it('maps 400 → validation, 401 → unauthorized, 429 → rate limited', () => {
    expect(profileErrorMessage(apiErr(400, 'VALIDATION_ERROR'), en)).toBe(en.errValidation)
    expect(profileErrorMessage(new Error('HTTP 400'), en)).toBe(en.errValidation)
    expect(profileErrorMessage(apiErr(401, 'UNAUTHORIZED'), en)).toBe(en.errUnauthorized)
    expect(profileErrorMessage(apiErr(429, 'RATE_LIMITED'), en)).toBe(en.errRateLimited)
  })
})
