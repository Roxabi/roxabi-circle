import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  authErrorResponses,
  invalidRequest,
  notFoundErrorResponse,
  sessionOrKeySecurity,
  validationErrorResponse,
} from '../lib/openapi'
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

const uploadIdParamSchema = z.object({ uploadId: z.string().min(1) })

const presignResultSchema = z
  .object({
    uploadId: z.string(),
    url: z.string(),
    method: z.string(),
    // Mock always sends Content-Type; an S3 signer may omit headers (auth in the URL).
    headers: z.record(z.string(), z.string()).optional(),
    expiresAt: z.number(),
    key: z.string(),
    requestId: z.string(),
  })
  .openapi('UploadPresign')

const completeResultSchema = z
  .object({
    ok: z.literal(true),
    key: z.string(),
    exists: z.boolean(),
    // Present only when PRESIGN_MODE=mock wrote a completion marker.
    mock: z.boolean().optional(),
    requestId: z.string(),
  })
  .openapi('UploadComplete')

export const uploadsRoutes = new OpenAPIHono<AppEnv>()

uploadsRoutes.use('/api/uploads/*', requireAuth)
uploadsRoutes.use('/api/uploads', requireAuth)

const presignUpload = createRoute({
  method: 'post',
  path: '/api/uploads/presign',
  tags: ['uploads'],
  summary: 'Mint a presigned upload URL (no secrets in the response)',
  description: 'Personal kennel (subject-owned object prefix). Not org-scoped.',
  security: sessionOrKeySecurity,
  request: {
    body: { content: { 'application/json': { schema: presignSchema } }, required: true },
  },
  responses: {
    201: {
      description: 'Presigned PUT URL and object key',
      content: { 'application/json': { schema: presignResultSchema } },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
  },
})

uploadsRoutes.openapi(
  presignUpload,
  async (c) => {
    const data = c.req.valid('json')
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
  },
  invalidRequest('Invalid presign'),
)

const completeUpload = createRoute({
  method: 'post',
  path: '/api/uploads/{uploadId}/complete',
  tags: ['uploads'],
  summary: 'Mark a presigned upload complete',
  security: sessionOrKeySecurity,
  request: {
    params: uploadIdParamSchema,
    body: { content: { 'application/json': { schema: completeSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'Upload object is present (or a mock marker was written)',
      content: { 'application/json': { schema: completeResultSchema } },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
  },
})

uploadsRoutes.openapi(
  completeUpload,
  async (c) => {
    const data = c.req.valid('json')
    const mockMode = resolvePresignMode(c.env as { PRESIGN_MODE?: string }) === 'mock'
    const result = await uploadsService.completeUpload({
      bucket: c.env.BUCKET,
      subject: c.get('subject')!,
      uploadId: c.req.valid('param').uploadId,
      key: data.key,
      mockMode,
    })
    return c.json({ ...result, requestId: c.get('requestId') })
  },
  invalidRequest('Invalid complete'),
)
