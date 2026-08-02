import { AppError } from '@gosilex/core'
import { Hono } from 'hono'
import { z } from 'zod'
import { requirePlatformRole } from '../middleware/org-context'
import { requireAuth } from '../middleware/require-auth'
import * as auditService from '../services/audit'
import type { AppEnv } from '../types'

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(200).optional(),
})

export const adminAuditRoutes = new Hono<AppEnv>()

adminAuditRoutes.use('/api/admin/audit-events', requireAuth)
adminAuditRoutes.use('/api/admin/audit-events/*', requireAuth)

adminAuditRoutes.get('/api/admin/audit-events', requirePlatformRole('super_admin'), async (c) => {
  const parsed = listSchema.safeParse({
    limit: c.req.query('limit') ?? undefined,
    cursor: c.req.query('cursor') ?? undefined,
  })
  if (!parsed.success) {
    throw AppError.validation('Invalid query', parsed.error.flatten().fieldErrors)
  }
  const db = c.get('db')
  if (!db) throw AppError.internal('db not bound')
  const { items, nextCursor } = await auditService.listRecentAuditEvents(db, {
    limit: parsed.data.limit,
    cursor: parsed.data.cursor,
  })
  return c.json({
    items,
    nextCursor,
    requestId: c.get('requestId'),
  })
})
