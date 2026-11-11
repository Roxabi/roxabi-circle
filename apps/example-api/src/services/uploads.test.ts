import { AppError } from '@kit/core'
import type { KitR2Bucket } from '@kit/storage'
import { StorageClient } from '@kit/storage'
import { describe, expect, it, vi } from 'vitest'
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
        body: new Blob([body]).stream(),
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

async function objectResponse(bucket: R2Bucket | KitR2Bucket, parts: string[]) {
  const object = await new StorageClient(bucket, 'demo').get(parts)
  if (!object) return null
  return new Response(object.body, {
    headers: object.httpMetadata?.contentType
      ? { 'content-type': object.httpMetadata.contentType }
      : undefined,
  })
}

describe('storage response consumer', () => {
  it('passes binary data through the unconsumed bucket stream with one GET', async () => {
    const bytes = new Uint8Array([0, 255, 128, 65])
    const stream = new Blob([bytes]).stream()
    const get = vi.fn(async (key: string) => ({
      key,
      body: stream,
      httpMetadata: { contentType: 'application/octet-stream' },
      async text() {
        throw new Error('binary stream must not be read as text')
      },
    }))
    const bucket: KitR2Bucket = { ...memoryBucket(), get }

    const response = await objectResponse(bucket, ['files', 'binary.bin'])
    expect(response).not.toBeNull()
    if (!response) throw new Error('expected object response')
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('demo/files/binary.bin')
    expect(response.body).toBe(stream)
    expect(response.bodyUsed).toBe(false)
    expect(stream.locked).toBe(false)
    expect(response.headers.get('content-type')).toBe('application/octet-stream')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
  })

  it('returns null for absent objects and rejects invalid paths before GET', async () => {
    const get = vi.fn(async (_key: string) => null)
    const bucket: KitR2Bucket = { ...memoryBucket(), get }
    expect(await objectResponse(bucket, ['missing'])).toBeNull()
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('demo/missing')
    get.mockClear()

    for (const part of ['../secret', 'a/../../b', '', '.', 'a/./b', 'a//b']) {
      await expect(objectResponse(bucket, [part])).rejects.toThrow()
    }
    expect(get).not.toHaveBeenCalled()
  })
})

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
