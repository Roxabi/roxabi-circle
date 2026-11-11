import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { AppError } from '@kit/core'
import {
  authErrorResponses,
  invalidRequest,
  sessionOnlySecurity,
  validationErrorResponse,
} from '../lib/openapi'
import { requirePlatformRole } from '../middleware/org-context'
import { requireAuth } from '../middleware/require-auth'
import { requireSession } from '../middleware/require-session'
import * as auditService from '../services/audit'
import type { AppEnv } from '../types'

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(512).optional(),
})

const auditEventSchema = z
  .object({
    id: z.string(),
    createdAt: z.number(),
    actorUserId: z.string().nullable(),
    action: z.string(),
    targetType: z.string().optional(),
    targetId: z.string().optional(),
    orgId: z.string().nullable().optional(),
    ip: z.string().nullable().optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi('AuditEvent')

export const adminAuditRoutes = new OpenAPIHono<AppEnv>()

adminAuditRoutes.use('/api/admin/audit-events', requireAuth)
adminAuditRoutes.use('/api/admin/audit-events/*', requireAuth)

const superAdmin = requirePlatformRole('super_admin')

const listAuditEvents = createRoute({
  method: 'get',
  path: '/api/admin/audit-events',
  tags: ['admin-audit'],
  summary: 'List recent platform audit events',
  security: sessionOnlySecurity,
  middleware: [superAdmin, requireSession] as const,
  request: { query: listSchema },
  responses: {
    200: {
      description: 'Cursor page of audit events',
      content: {
        'application/json': {
          schema: z.object({
            items: z.array(auditEventSchema),
            nextCursor: z.string().nullable(),
            requestId: z.string(),
          }),
        },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
  },
})

adminAuditRoutes.openapi(
  listAuditEvents,
  async (c) => {
    const data = c.req.valid('query')
    const db = c.get('db')
    if (!db) throw AppError.internal('db not bound')
    const { items, nextCursor } = await auditService.listRecentAuditEvents(db, {
      limit: data.limit,
      cursor: data.cursor,
    })
    return c.json({
      items,
      nextCursor,
      requestId: c.get('requestId'),
    })
  },
  invalidRequest('Invalid query'),
)
