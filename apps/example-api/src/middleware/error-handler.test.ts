import { AppError } from '@kit/core'
import { StorageError } from '@kit/storage'
import { HTTPException } from 'hono/http-exception'
import { describe, expect, it } from 'vitest'
import { DEMO_EMAIL, DEMO_PASSWORD } from '../seed/demo-data'
import { createSeededDemoApi, loginCookie } from '../test/api-fixture'
import { mapHttpException, mapStorageError } from './error-handler'

const ORIGIN = 'http://localhost:5173'

async function loginDemo() {
  const { app, env } = await createSeededDemoApi({ seed: { notes: true, environment: 'test' } })
  const cookie = await loginCookie(app, env, DEMO_EMAIL, DEMO_PASSWORD, ORIGIN)
  return { app, env, cookie }
}

describe('mapStorageError', () => {
  it('maps PATH_TRAVERSAL to validation 400 with safe message', () => {
    const mapped = mapStorageError(new StorageError('PATH_TRAVERSAL', 'path traversal rejected'))
    expect(mapped).toBeInstanceOf(AppError)
    expect(mapped?.code).toBe('VALIDATION_ERROR')
    expect(mapped?.status).toBe(400)
    expect(mapped?.message).toBe('Invalid storage path')
  })

  it('maps OUTSIDE_PREFIX to validation 400 with safe message', () => {
    const mapped = mapStorageError(new StorageError('OUTSIDE_PREFIX', 'key outside base prefix'))
    expect(mapped).toBeInstanceOf(AppError)
    expect(mapped?.code).toBe('VALIDATION_ERROR')
    expect(mapped?.status).toBe(400)
    expect(mapped?.message).toBe('Invalid storage path')
  })

  it('maps IO to scrubbed internal 500', () => {
    const mapped = mapStorageError(new StorageError('IO', 'provider leaked stack here'))
    expect(mapped).toBeInstanceOf(AppError)
    expect(mapped?.code).toBe('INTERNAL_ERROR')
    expect(mapped?.status).toBe(500)
    expect(mapped?.message).not.toContain('provider')
  })

  it('returns null for non-StorageError', () => {
    expect(mapStorageError(new Error('plain'))).toBeNull()
    expect(mapStorageError(AppError.notFound())).toBeNull()
    expect(mapStorageError(null)).toBeNull()
  })
})

describe('mapHttpException', () => {
  it('maps 400 HTTPException to VALIDATION_ERROR with Invalid JSON', () => {
    const mapped = mapHttpException(
      new HTTPException(400, { message: 'Malformed JSON in request body' }),
    )
    expect(mapped).toBeInstanceOf(AppError)
    expect(mapped?.code).toBe('VALIDATION_ERROR')
    expect(mapped?.status).toBe(400)
    expect(mapped?.message).toBe('Invalid JSON')
  })

  it('returns null for non-400 HTTPException (fail closed)', () => {
    expect(mapHttpException(new HTTPException(401, { message: 'nope' }))).toBeNull()
    expect(mapHttpException(new HTTPException(403, { message: 'nope' }))).toBeNull()
    expect(mapHttpException(new HTTPException(500))).toBeNull()
  })

  it('returns null for non-HTTPException', () => {
    expect(mapHttpException(new Error('plain'))).toBeNull()
    expect(mapHttpException(AppError.validation('x'))).toBeNull()
  })
})

describe('onError — malformed JSON body', () => {
  it('POST /api/notes with truncated JSON returns 400 VALIDATION_ERROR', async () => {
    const { app, env, cookie } = await loginDemo()
    const res = await app.request(
      '/api/notes',
      {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
          Origin: ORIGIN,
        },
        body: '{"title":',
      },
      env,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('POST /api/notes with empty JSON body returns 400 VALIDATION_ERROR', async () => {
    const { app, env, cookie } = await loginDemo()
    const res = await app.request(
      '/api/notes',
      {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
          Origin: ORIGIN,
        },
        body: '',
      },
      env,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })
})
