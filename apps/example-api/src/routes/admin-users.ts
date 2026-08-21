import { AppError, parseOrThrow } from '@kit/core'
import { listQuerySchema } from '@kit/types'
import { Hono } from 'hono'
import { z } from 'zod'
import { resolveEmailPort } from '../lib/email-port'
import { requireBaAdapter } from '../lib/require-ba-adapter'
import { corsAllowlist } from '../lib/session-env'
import { requirePlatformRole } from '../middleware/org-context'
import { requireAuth } from '../middleware/require-auth'
import * as adminUsersService from '../services/admin-users'
import type { AppEnv } from '../types'

const createSchema = z
  .object({
    email: z.string().email().max(254),
    name: z.string().min(1).max(120).optional(),
    platformRole: z.enum(['staff', 'super_admin']).nullable().optional(),
    memberships: z
      .array(
        z.object({
          orgId: z.string().min(1).max(64),
          role: z.string().min(1).max(48),
        }),
      )
      .max(20)
      .optional(),
    sendEmail: z.boolean().optional(),
  })
  .strict()

const listSchema = listQuerySchema.extend({
  q: z.string().max(120).optional(),
})

export const adminUsersRoutes = new Hono<AppEnv>()

adminUsersRoutes.use('/api/admin/users', requireBaAdapter, requireAuth)
adminUsersRoutes.use('/api/admin/users/*', requireBaAdapter, requireAuth)

function requireSession(c: { get: (k: 'authMethod') => string | undefined }) {
  if (c.get('authMethod') !== 'session') {
    throw AppError.forbidden('Admin user management requires a session cookie')
  }
}

function webBase(c: {
  env: AppEnv['Bindings']
  req: { header: (n: string) => string | undefined }
}): string {
  const origin = c.req.header('origin')
  const list = corsAllowlist(c.env)
  if (origin && list.includes(origin)) return origin
  return list[0]
}

adminUsersRoutes.get('/api/admin/users', requirePlatformRole('super_admin', 'staff'), async (c) => {
  requireSession(c)
  const data = parseOrThrow(
    listSchema,
    {
      q: c.req.query('q') ?? undefined,
      limit: c.req.query('limit') ?? undefined,
      cursor: c.req.query('cursor') ?? undefined,
    },
    'Invalid query',
  )
  const db = c.get('db')!
  const platformRole = c.get('platformRole')
  if (platformRole !== 'super_admin' && platformRole !== 'staff') {
    throw AppError.forbidden('Platform role required')
  }
  const page = await adminUsersService.listAdminUsers(db, {
    actorUserId: c.get('subject')!,
    actorPlatformRole: platformRole,
    q: data.q,
    limit: data.limit,
    cursor: data.cursor,
  })
  return c.json({ ...page, requestId: c.get('requestId') })
})

adminUsersRoutes.post(
  '/api/admin/users',
  requirePlatformRole('super_admin', 'staff'),
  async (c) => {
    requireSession(c)
    const data = parseOrThrow(
      createSchema,
      await c.req.json().catch(() => null),
      'Invalid create user payload',
    )
    const platformRole = c.get('platformRole')
    if (platformRole !== 'super_admin' && platformRole !== 'staff') {
      throw AppError.forbidden('Platform role required')
    }
    const db = c.get('db')!
    const result = await adminUsersService.createAdminUser(db, {
      actorUserId: c.get('subject')!,
      actorPlatformRole: platformRole,
      email: data.email,
      name: data.name,
      platformRole: data.platformRole ?? null,
      memberships: data.memberships,
      sendEmail: data.sendEmail,
      webBaseUrl: webBase(c),
      emailPort: resolveEmailPort(c.env),
      requestId: c.get('requestId'),
    })
    return c.json(
      {
        user: result.user,
        memberships: result.memberships,
        welcomeEmailSent: result.welcomeEmailSent,
        requestId: c.get('requestId'),
      },
      201,
    )
  },
)

adminUsersRoutes.post(
  '/api/admin/users/:id/resend-welcome',
  requirePlatformRole('super_admin', 'staff'),
  async (c) => {
    requireSession(c)
    const platformRole = c.get('platformRole')
    if (platformRole !== 'super_admin' && platformRole !== 'staff') {
      throw AppError.forbidden('Platform role required')
    }
    const db = c.get('db')!
    await adminUsersService.resendWelcome(db, {
      actorUserId: c.get('subject')!,
      actorPlatformRole: platformRole,
      userId: c.req.param('id'),
      webBaseUrl: webBase(c),
      emailPort: resolveEmailPort(c.env),
    })
    return c.json({ ok: true, requestId: c.get('requestId') })
  },
)
