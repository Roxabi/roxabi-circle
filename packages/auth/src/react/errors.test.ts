import { describe, expect, it } from 'vitest'
import { changePasswordErrorMessage, isRateLimited, resolveAuthFormStatus } from './errors'

const copy = {
  changePasswordReauth: 'reauth',
  changePasswordWrong: 'wrong',
  errRateLimited: 'slow',
}

describe('resolveAuthFormStatus', () => {
  it('reads duck-typed status/code', () => {
    expect(resolveAuthFormStatus({ status: 401, code: 'UNAUTHORIZED' })).toEqual({
      status: 401,
      code: 'UNAUTHORIZED',
    })
  })

  it('parses BA Error HTTP N', () => {
    expect(resolveAuthFormStatus(new Error('HTTP 429'))).toEqual({ status: 429, code: null })
  })
})

describe('isRateLimited', () => {
  it('matches 429 status or RATE_LIMITED', () => {
    expect(isRateLimited({ status: 429 })).toBe(true)
    expect(isRateLimited({ code: 'RATE_LIMITED' })).toBe(true)
    expect(isRateLimited(new Error('HTTP 429'))).toBe(true)
    expect(isRateLimited({ status: 400 })).toBe(false)
  })
})

describe('changePasswordErrorMessage', () => {
  const fallback = () => 'fallback'

  it('maps 401/403 to reauth, 400 to wrong, 429 to rate', () => {
    expect(changePasswordErrorMessage({ status: 401 }, copy, fallback)).toBe('reauth')
    expect(changePasswordErrorMessage({ status: 403, code: 'FORBIDDEN' }, copy, fallback)).toBe(
      'reauth',
    )
    expect(changePasswordErrorMessage({ status: 400 }, copy, fallback)).toBe('wrong')
    expect(changePasswordErrorMessage(new Error('HTTP 429'), copy, fallback)).toBe('slow')
  })

  it('falls back for unknown errors', () => {
    expect(changePasswordErrorMessage(new Error('boom'), copy, fallback)).toBe('fallback')
  })
})
