import { describe, expect, it } from 'vitest'
import { ApiError } from './api'

describe('ApiError', () => {
  it('maps nested envelope', () => {
    const err = new ApiError(401, {
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      requestId: 'req_abc',
    })
    expect(err.code).toBe('UNAUTHORIZED')
    expect(err.requestId).toBe('req_abc')
    expect(err.status).toBe(401)
  })
})
