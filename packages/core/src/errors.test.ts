import { describe, expect, it } from 'vitest'
import { AppError, newRequestId, toApiErrorBody } from './errors'

describe('AppError', () => {
  it('builds nested API error body without stack', () => {
    const err = AppError.validation('bad', { fieldErrors: { title: ['Required'] } })
    const { body, status } = toApiErrorBody(err, 'req_test')
    expect(status).toBe(400)
    expect(body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'bad',
        details: { fieldErrors: { title: ['Required'] } },
      },
      requestId: 'req_test',
    })
    expect(JSON.stringify(body)).not.toMatch(/stack/i)
  })

  it('maps unknown errors to INTERNAL_ERROR', () => {
    const { body, status } = toApiErrorBody(new Error('secret stack'), 'req_x')
    expect(status).toBe(500)
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(body.error.message).toBe('Internal error')
    expect(body.error.message).not.toContain('secret')
  })

  it('newRequestId is non-empty and stable format', () => {
    const id = newRequestId()
    expect(id.startsWith('req_')).toBe(true)
    expect(id.length).toBeGreaterThan(8)
  })
})
