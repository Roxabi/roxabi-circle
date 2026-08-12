import { AppError } from '@kit/core'
import { StorageError } from '@kit/storage'
import { describe, expect, it } from 'vitest'
import { mapStorageError } from './error-handler'

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
