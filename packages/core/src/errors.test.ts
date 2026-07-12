import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AppError, newRequestId, toApiErrorBody } from './errors'
import { parseOrThrow } from './parse'

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

  it('scrubs AppError 5xx messages and details from public body', () => {
    const err = new AppError('INTERNAL_ERROR', 'SESSION_SECRET is required (min 32 chars)', 500, {
      secretHint: 'should-not-leak',
    })
    const { body, status } = toApiErrorBody(err, 'req_scrub')
    expect(status).toBe(500)
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(body.error.message).toBe('Internal error')
    expect(body.error.message).not.toContain('SESSION_SECRET')
    expect(body.error.details).toBeUndefined()
  })

  it('keeps 4xx AppError messages and details public', () => {
    const err = AppError.validation('bad field', { fieldErrors: { title: ['Required'] } })
    const { body, status } = toApiErrorBody(err, 'req_4xx')
    expect(status).toBe(400)
    expect(body.error.message).toBe('bad field')
    expect(body.error.details).toEqual({ fieldErrors: { title: ['Required'] } })
  })

  it('maps rateLimited to 429', () => {
    const { body, status } = toApiErrorBody(AppError.rateLimited(), 'req_rl')
    expect(status).toBe(429)
    expect(body.error.code).toBe('RATE_LIMITED')
  })

  it('derives status from ErrorCode when omitted', () => {
    const err = new AppError('FORBIDDEN', 'nope')
    expect(err.status).toBe(403)
  })

  it('newRequestId is non-empty and stable format', () => {
    const id = newRequestId()
    expect(id.startsWith('req_')).toBe(true)
    expect(id.length).toBeGreaterThan(8)
  })
})

describe('parseOrThrow', () => {
  const schema = z.object({ title: z.string().min(1) })

  it('returns parsed data on success', () => {
    expect(parseOrThrow(schema, { title: 'ok' })).toEqual({ title: 'ok' })
  })

  it('throws VALIDATION_ERROR with fieldErrors on failure', () => {
    try {
      parseOrThrow(schema, { title: '' }, 'Invalid note')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(AppError)
      const err = e as AppError
      expect(err.code).toBe('VALIDATION_ERROR')
      expect(err.status).toBe(400)
      expect(err.message).toBe('Invalid note')
      expect(err.details).toMatchObject({ fieldErrors: expect.any(Object) })
    }
  })
})
