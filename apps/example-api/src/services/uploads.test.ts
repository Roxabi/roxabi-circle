import { AppError } from '@kit/core'
import type { KitR2Bucket } from '@kit/storage'
import { StorageClient } from '@kit/storage'
import { describe, expect, it } from 'vitest'
import { completeUpload } from './uploads'

function memoryBucket(): KitR2Bucket & { keys: () => string[] } {
  const store = new Map<string, string>()
  return {
    async put(key, value) {
      store.set(key, typeof value === 'string' ? value : String(value))
      return { key }
    },
    async get(key) {
      const body = store.get(key)
      if (body === undefined) return null
      return {
        key,
        async text() {
          return body
        },
      }
    },
    async delete(key) {
      store.delete(key)
    },
    async head(key) {
      return store.has(key) ? { key } : null
    },
    keys: () => [...store.keys()],
  }
}

describe('completeUpload', () => {
  const subject = 'user_demo'
  const uploadId = 'upload-uuid-1'
  const filename = 'photo.jpg'

  function expectedKey(bucket: KitR2Bucket) {
    return new StorageClient(bucket, 'demo').key(subject, uploadId, filename)
  }

  it('rejects empty key via assertObjectKey', async () => {
    const bucket = memoryBucket()
    await expect(
      completeUpload({
        bucket,
        subject,
        uploadId,
        key: '',
        mockMode: true,
      }),
    ).rejects.toMatchObject({
      name: 'AppError',
      code: 'VALIDATION_ERROR',
      message: 'invalid object key',
    })
  })

  it('rejects path traversal in key', async () => {
    const bucket = memoryBucket()
    await expect(
      completeUpload({
        bucket,
        subject,
        uploadId,
        key: `demo/${subject}/${uploadId}/../secret.bin`,
        mockMode: true,
      }),
    ).rejects.toMatchObject({
      name: 'AppError',
      code: 'VALIDATION_ERROR',
      message: 'invalid object key',
    })
    expect(bucket.keys()).toHaveLength(0)
  })

  it('rejects key outside expected upload prefix', async () => {
    const bucket = memoryBucket()
    await expect(
      completeUpload({
        bucket,
        subject,
        uploadId,
        key: `demo/other-user/${uploadId}/${filename}`,
        mockMode: true,
      }),
    ).rejects.toMatchObject({
      name: 'AppError',
      code: 'VALIDATION_ERROR',
      message: 'key does not match upload',
    })
    expect(bucket.keys()).toHaveLength(0)
  })

  it('rejects uploadId that joinObjectKey would elide (dot / empty binding)', async () => {
    const bucket = memoryBucket()
    await expect(
      completeUpload({
        bucket,
        subject,
        uploadId: '.',
        key: `demo/${subject}/any-suffix/${filename}`,
        mockMode: true,
      }),
    ).rejects.toMatchObject({
      name: 'AppError',
      code: 'VALIDATION_ERROR',
      message: 'invalid uploadId',
    })
    expect(bucket.keys()).toHaveLength(0)
  })

  it('mockMode put goes through StorageClient under demo prefix', async () => {
    const bucket = memoryBucket()
    const key = expectedKey(bucket)
    const result = await completeUpload({
      bucket,
      subject,
      uploadId,
      key,
      mockMode: true,
    })
    expect(result).toEqual({ ok: true, key, exists: true, mock: true })
    expect(bucket.keys()).toEqual([key])
    expect(key.startsWith('demo/')).toBe(true)
    expect(key).toBe(`demo/${subject}/${uploadId}/${filename}`)
  })

  it('returns exists when object already present (no mock put)', async () => {
    const bucket = memoryBucket()
    const key = expectedKey(bucket)
    await bucket.put(key, 'already-uploaded')
    const result = await completeUpload({
      bucket,
      subject,
      uploadId,
      key,
      mockMode: false,
    })
    expect(result).toEqual({ ok: true, key, exists: true })
    expect(bucket.keys()).toEqual([key])
  })

  it('notFound when object missing and not mockMode', async () => {
    const bucket = memoryBucket()
    const key = expectedKey(bucket)
    await expect(
      completeUpload({
        bucket,
        subject,
        uploadId,
        key,
        mockMode: false,
      }),
    ).rejects.toBeInstanceOf(AppError)
    await expect(
      completeUpload({
        bucket,
        subject,
        uploadId,
        key,
        mockMode: false,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
