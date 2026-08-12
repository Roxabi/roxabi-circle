import { describe, expect, it } from 'vitest'
import { en } from '../messages/en'
import {
  changePasswordErrorMessage,
  isRateLimited,
  loginErrorMessage,
  profileErrorMessage,
} from './account-errors'
import { ApiError } from './api'

function apiErr(status: number, code: string): ApiError {
  return new ApiError(status, {
    error: { code, message: 'wire' },
    requestId: 'req_test',
  })
}

describe('isRateLimited', () => {
  it('detects ApiError 429 / RATE_LIMITED and Error(HTTP 429)', () => {
    expect(isRateLimited(apiErr(429, 'RATE_LIMITED'))).toBe(true)
    expect(isRateLimited(apiErr(429, 'INTERNAL_ERROR'))).toBe(true)
    expect(isRateLimited(apiErr(401, 'RATE_LIMITED'))).toBe(true)
    expect(isRateLimited(new Error('HTTP 429'))).toBe(true)
    expect(isRateLimited(new Error('HTTP 401'))).toBe(false)
    expect(isRateLimited(apiErr(401, 'UNAUTHORIZED'))).toBe(false)
    expect(isRateLimited(new Error('nope'))).toBe(false)
  })
})

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
    expect(profileErrorMessage(new Error('HTTP 429'), en)).toBe(en.errRateLimited)
  })
})

describe('loginErrorMessage', () => {
  // Intentional: UI toast collapse only. Wire HTTP status may still differ
  // (Network tab). Full anti-enum needs BA/Worker normalization — not this helper.
  it('maps 400/401/403 ApiError + raw HTTP → same loginFailed (UI copy only)', () => {
    expect(loginErrorMessage(apiErr(401, 'UNAUTHORIZED'), en)).toBe(en.loginFailed)
    expect(loginErrorMessage(new Error('HTTP 401'), en)).toBe(en.loginFailed)
    expect(loginErrorMessage(apiErr(400, 'VALIDATION_ERROR'), en)).toBe(en.loginFailed)
    expect(loginErrorMessage(new Error('HTTP 400'), en)).toBe(en.loginFailed)
    expect(loginErrorMessage(apiErr(403, 'FORBIDDEN'), en)).toBe(en.loginFailed)
    expect(loginErrorMessage(new Error('HTTP 403'), en)).toBe(en.loginFailed)
    expect(loginErrorMessage(apiErr(401, 'UNAUTHORIZED'), en)).not.toBe(en.errUnauthorized)
  })

  it('maps 429 → rate limited only', () => {
    expect(loginErrorMessage(apiErr(429, 'RATE_LIMITED'), en)).toBe(en.errRateLimited)
    expect(loginErrorMessage(new Error('HTTP 429'), en)).toBe(en.errRateLimited)
  })

  it('never returns change-password or session-expired copy on failed sign-in', () => {
    const cases: unknown[] = [
      apiErr(400, 'VALIDATION_ERROR'),
      apiErr(401, 'UNAUTHORIZED'),
      apiErr(403, 'FORBIDDEN'),
      new Error('HTTP 401'),
      new Error('HTTP 403'),
    ]
    for (const err of cases) {
      const msg = loginErrorMessage(err, en)
      expect(msg).toBe(en.loginFailed)
      expect(msg).not.toBe(en.changePasswordWrong)
      expect(msg).not.toBe(en.changePasswordReauth)
      expect(msg).not.toBe(en.errUnauthorized)
    }
  })
})
