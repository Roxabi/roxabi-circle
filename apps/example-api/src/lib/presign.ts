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
    // Fail closed: never silently mint mock URLs when operator asked for S3.
    // Kit v1 has no aws4fetch signer yet — S3 mode requires full creds and is not mock-shaped.
    const id = env.R2_ACCESS_KEY_ID
    const secret = env.R2_SECRET_ACCESS_KEY
    if (!id || !secret || !env.R2_ACCOUNT_ID || !env.R2_BUCKET_NAME) {
      throw new Error(
        'PRESIGN_MODE=s3 requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME',
      )
    }
    // Placeholder until aws4fetch is wired — still fail closed rather than fake real R2.
    throw new Error(
      'PRESIGN_MODE=s3 is not implemented in kit v1 (no aws4fetch). Use PRESIGN_MODE=mock for local/CI.',
    )
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
