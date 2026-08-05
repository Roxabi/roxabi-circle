import { parseOrThrow } from '@kit/core'
import { Hono } from 'hono'
import { z } from 'zod'
import { createAppPresignSigner, resolvePresignMode } from '../lib/presign'
import { requireAuth } from '../middleware/require-auth'
import * as uploadsService from '../services/uploads'
import type { AppEnv } from '../types'

const presignSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(200),
  size: z.number().int().positive(),
})

const completeSchema = z.object({
  key: z.string().min(1).max(1024),
})

export const uploadsRoutes = new Hono<AppEnv>()

uploadsRoutes.use('/api/uploads/*', requireAuth)
uploadsRoutes.use('/api/uploads', requireAuth)

uploadsRoutes.post('/api/uploads/presign', async (c) => {
  const raw = await c.req.json().catch(() => null)
  const data = parseOrThrow(presignSchema, raw, 'Invalid presign')
  const signer = createAppPresignSigner(c.env as { PRESIGN_MODE?: string })
  const out = await uploadsService.createUploadPresign({
    signer,
    subject: c.get('subject')!,
    filename: data.filename,
    contentType: data.contentType,
    size: data.size,
  })
  // Never return secrets — only signed URL + metadata
  return c.json({ ...out, requestId: c.get('requestId') }, 201)
})

uploadsRoutes.post('/api/uploads/:uploadId/complete', async (c) => {
  const raw = await c.req.json().catch(() => null)
  const data = parseOrThrow(completeSchema, raw, 'Invalid complete')
  const mockMode = resolvePresignMode(c.env as { PRESIGN_MODE?: string }) === 'mock'
  const result = await uploadsService.completeUpload({
    bucket: c.env.BUCKET,
    subject: c.get('subject')!,
    uploadId: c.req.param('uploadId'),
    key: data.key,
    mockMode,
  })
  return c.json({ ...result, requestId: c.get('requestId') })
})
