import { AppError, parseOrThrow } from '@kit/core'
import { listQuerySchema } from '@kit/types'
import { Hono } from 'hono'
import { requirePlatformRole } from '../middleware/org-context'
import { requireAuth } from '../middleware/require-auth'
import * as auditService from '../services/audit'
import type { AppEnv } from '../types'

export const adminAuditRoutes = new Hono<AppEnv>()

adminAuditRoutes.use('/api/admin/audit-events', requireAuth)
adminAuditRoutes.use('/api/admin/audit-events/*', requireAuth)

adminAuditRoutes.get('/api/admin/audit-events', requirePlatformRole('super_admin'), async (c) => {
  const data = parseOrThrow(
    listQuerySchema,
    {
      limit: c.req.query('limit') ?? undefined,
      cursor: c.req.query('cursor') ?? undefined,
    },
    'Invalid query',
  )
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
})
