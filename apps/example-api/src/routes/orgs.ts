import { AppError } from '@gosilex/core'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireBaAdapter } from '../lib/require-ba-adapter'
import {
  requireOrgCapability,
  requireOrgContext,
  requirePlatformRole,
} from '../middleware/org-context'
import { requireAuth } from '../middleware/require-auth'
import * as orgsService from '../services/orgs'
import * as platformModulesService from '../services/platform-modules'
import type { AppEnv } from '../types'

const createSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(48).optional(),
  kind: z.enum(['client', 'internal']).optional(),
})

const patchModuleSchema = z.object({
  enabled: z.boolean(),
})

export const orgsRoutes = new Hono<AppEnv>()

orgsRoutes.use('/api/orgs', requireBaAdapter, requireAuth)
orgsRoutes.use('/api/orgs/*', requireBaAdapter, requireAuth)
orgsRoutes.use('/api/platform/*', requireBaAdapter, requireAuth)

orgsRoutes.get('/api/orgs', async (c) => {
  const db = c.get('db')!
  const subject = c.get('subject')!
  const orgs = await orgsService.listOrgsForSubject(db, subject)
  return c.json({ orgs, requestId: c.get('requestId') })
})

orgsRoutes.post('/api/orgs', async (c) => {
  if (c.get('authMethod') !== 'session') {
    throw AppError.forbidden('Creating organizations requires a session')
  }
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    throw AppError.validation('Invalid organization payload', parsed.error.flatten().fieldErrors)
  }
  const db = c.get('db')!
  const org = await orgsService.createOrganization(db, {
    name: parsed.data.name,
    slug: parsed.data.slug,
    kind: parsed.data.kind,
    ownerUserId: c.get('subject')!,
  })
  return c.json({ org, requestId: c.get('requestId') }, 201)
})

orgsRoutes.get('/api/orgs/:orgId', requireOrgContext({ allowSuperAdmin: true }), async (c) => {
  const db = c.get('db')!
  const org = await orgsService.getOrgForSubject(db, c.get('orgId')!, c.get('subject')!)
  return c.json({ org, requestId: c.get('requestId') })
})

orgsRoutes.get(
  '/api/orgs/:orgId/members',
  requireOrgContext({ allowSuperAdmin: true }),
  requireOrgCapability('manage_members'),
  async (c) => {
    const db = c.get('db')!
    const members = await orgsService.listOrgMembers(db, c.get('orgId')!)
    return c.json({ members, requestId: c.get('requestId') })
  },
)

orgsRoutes.get(
  '/api/orgs/:orgId/modules',
  requireOrgContext({ allowSuperAdmin: true }),
  async (c) => {
    const db = c.get('db')!
    const modules = await platformModulesService.getOrgModulesEffective(db, c.get('orgId')!)
    return c.json({ modules, requestId: c.get('requestId') })
  },
)

orgsRoutes.patch(
  '/api/orgs/:orgId/modules/:moduleId',
  requireOrgContext(),
  requireOrgCapability('manage_modules'),
  async (c) => {
    if (c.get('authMethod') !== 'session') {
      throw AppError.forbidden('Module settings require a session cookie')
    }
    const parsed = patchModuleSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      throw AppError.validation('Invalid module payload', parsed.error.flatten().fieldErrors)
    }
    const db = c.get('db')!
    await platformModulesService.setOrgModuleEnabled(
      db,
      c.get('orgId')!,
      c.req.param('moduleId'),
      parsed.data.enabled,
    )
    const modules = await platformModulesService.getOrgModulesEffective(db, c.get('orgId')!)
    return c.json({ modules, requestId: c.get('requestId') })
  },
)

orgsRoutes.get(
  '/api/platform/modules',
  requirePlatformRole(['super_admin', 'staff']),
  async (c) => {
    const db = c.get('db')!
    const modules = await platformModulesService.listPlatformPublic(db)
    return c.json({ modules, requestId: c.get('requestId') })
  },
)

orgsRoutes.patch(
  '/api/platform/modules/:moduleId',
  requirePlatformRole('super_admin'),
  async (c) => {
    if (c.get('authMethod') !== 'session') {
      throw AppError.forbidden('Platform module settings require a session')
    }
    const body = z
      .object({ available: z.boolean() })
      .safeParse(await c.req.json().catch(() => null))
    if (!body.success) {
      throw AppError.validation('Invalid platform module payload', body.error.flatten().fieldErrors)
    }
    const db = c.get('db')!
    await platformModulesService.setPlatformAvailable(
      db,
      c.req.param('moduleId'),
      body.data.available,
    )
    const modules = await platformModulesService.listPlatformPublic(db)
    return c.json({ modules, requestId: c.get('requestId') })
  },
)
