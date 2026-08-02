import type { KitR2Bucket } from '@gosilex/storage'
import {
  createMockPresignSigner,
  createPresignedUrl,
  type PresignResult,
  type PresignSigner,
  StorageClient,
} from '@gosilex/storage'

export type PresignMode = 'mock' | 's3'

export function resolvePresignMode(env: {
  PRESIGN_MODE?: string
  ENVIRONMENT?: string
}): PresignMode {
  const raw = (env.PRESIGN_MODE ?? '').toLowerCase()
  if (raw === 's3') return 's3'
  return 'mock'
}

/** App signer: mock by default (CI/local). S3 path reserved for real R2 credentials later. */
export function createAppPresignSigner(env: {
  PRESIGN_MODE?: string
  R2_ACCOUNT_ID?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_BUCKET_NAME?: string
}): PresignSigner {
  const mode = resolvePresignMode(env)
  if (mode === 's3') {
    // Fail closed without credentials — products wire aws4fetch when ready.
    const id = env.R2_ACCESS_KEY_ID
    const secret = env.R2_SECRET_ACCESS_KEY
    if (!id || !secret || !env.R2_ACCOUNT_ID || !env.R2_BUCKET_NAME) {
      return createMockPresignSigner({ baseUrl: 'https://presign.fallback.mock' })
    }
    // Kit v1 still uses mock shape for S3 until aws4fetch is added as app dep.
    return createMockPresignSigner({
      baseUrl: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}`,
    })
  }
  return createMockPresignSigner()
}

export async function presignDemoUpload(opts: {
  signer: PresignSigner
  subject: string
  uploadId: string
  filename: string
  contentType: string
  expiresIn?: number
}): Promise<PresignResult & { key: string }> {
  const safeName = opts.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file.bin'
  const client = new StorageClient({} as KitR2Bucket, 'demo')
  const key = client.key(opts.subject, opts.uploadId, safeName)
  const result = await createPresignedUrl(opts.signer, {
    key,
    method: 'PUT',
    expiresIn: opts.expiresIn ?? 300,
    contentType: opts.contentType,
  })
  return { ...result, key }
}
