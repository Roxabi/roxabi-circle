import { AppError } from '@kit/core'
import type { KitR2Bucket, PresignSigner } from '@kit/storage'
import { StorageClient } from '@kit/storage'
import { presignDemoUpload } from '../lib/presign'

const MAX_BYTES = 5_000_000

export async function createUploadPresign(opts: {
  signer: PresignSigner
  subject: string
  filename: string
  contentType: string
  size: number
}) {
  if (opts.size <= 0 || opts.size > MAX_BYTES) {
    throw AppError.validation(`size must be 1..${MAX_BYTES}`, { max: MAX_BYTES })
  }
  if (!opts.contentType?.trim()) {
    throw AppError.fieldErrors('contentType required', {
      contentType: ['contentType required'],
    })
  }
  const uploadId = crypto.randomUUID()
  const signed = await presignDemoUpload({
    signer: opts.signer,
    subject: opts.subject,
    uploadId,
    filename: opts.filename,
    contentType: opts.contentType,
  })
  return {
    uploadId,
    url: signed.url,
    method: signed.method,
    headers: signed.headers ?? {},
    expiresAt: signed.expiresAt,
    key: signed.key,
  }
}

export async function completeUpload(opts: {
  bucket: KitR2Bucket
  subject: string
  uploadId: string
  key: string
  /** When mock, allow complete if key matches demo prefix without object (or put marker). */
  mockMode: boolean
}) {
  const client = new StorageClient(opts.bucket, 'demo')
  const expectedPrefix = client.key(opts.subject, opts.uploadId)
  if (!opts.key.startsWith(`${expectedPrefix}/`) && opts.key !== expectedPrefix) {
    throw AppError.validation('key does not match upload')
  }
  // re-join via client to assert prefix
  const head = await opts.bucket.head?.(opts.key)
  if (head) {
    return { ok: true as const, key: opts.key, exists: true }
  }
  if (opts.mockMode) {
    // mock PUT never hit R2 — record marker so complete can succeed in CI
    await opts.bucket.put(opts.key, 'mock-upload-complete', {
      httpMetadata: { contentType: 'application/octet-stream' },
    })
    return { ok: true as const, key: opts.key, exists: true, mock: true }
  }
  throw AppError.notFound('Upload object missing')
}
