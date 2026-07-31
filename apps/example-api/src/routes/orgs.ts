import { AppError } from '@gosilex/core'
import { Hono } from 'hono'
import { z } from 'zod'
import { resolveEmailPort } from '../lib/email-port'
import { requireBaAdapter } from '../lib/require-ba-adapter'
import { corsAllowlist } from '../lib/session-env'
import {
  requireOrgCapability,
  requireOrgContext,
  requirePlatformRole,
} from '../middleware/org-context'
import { requireAuth } from '../middleware/require-auth'
import * as invitationsService from '../services/invitations'
import * as orgRolesService from '../services/org-roles'
import * as orgsService from '../services/orgs'
import * as platformModulesService from '../services/platform-modules'
import type { AppEnv } from '../types'

const createSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(48).optional(),
  // kind is server-forced to client for public create (review fix)
})

const patchModuleSchema = z.object({
  enabled: z.boolean(),
})

const createRoleSchema = z
  .object({
    key: z.string().min(1).max(48),
    name: z.string().min(1).max(80),
    grants: z
      .array(
        z.object({
          moduleId: z.string().min(1),
          access: z.enum(['write', 'read', 'disabled']),
        }),
      )
      .optional(),
  })
  .strict()

const patchGrantSchema = z
  .object({
    access: z.enum(['write', 'read', 'disabled']),
  })
  .strict()

const inviteCreateSchema = z
  .object({
    email: z.string().email().max(254),
    role: z.enum(['admin', 'member', 'reader']),
  })
  .strict()

export const orgsRoutes = new Hono<AppEnv>()

orgsRoutes.use('/api/orgs', requireBaAdapter, requireAuth)
orgsRoutes.use('/api/orgs/*', requireBaAdapter, requireAuth)
orgsRoutes.use('/api/platform/*', requireBaAdapter, requireAuth)

orgsRoutes.get('/api/orgs', async (c) => {
  const db = c.get('db')!
  const subject = c.get('subject')!
  let orgs = await orgsService.listOrgsForSubject(db, subject)
  // D11 — org-bound sk_ only sees its org in the list
  const keyOrg = c.get('keyOrganizationId')
  if (c.get('authMethod') === 'api_key' && keyOrg) {
    orgs = orgs.filter((o) => o.id === keyOrg)
  }
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
    kind: 'client',
    ownerUserId: c.get('subject')!,
  })
  c.header('Location', `/api/orgs/${org.id}`)
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

orgsRoutes.post(
  '/api/orgs/:orgId/invitations',
  requireOrgContext(),
  requireOrgCapability('manage_members'),
  async (c) => {
    if (c.get('authMethod') !== 'session') {
      throw AppError.forbidden('Creating invitations requires a session cookie')
    }
    const orgRole = c.get('orgRole')
    if (!orgRole) {
      throw AppError.forbidden('Organization membership required')
    }
    const parsed = inviteCreateSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      throw AppError.validation('Invalid invitation payload', parsed.error.flatten().fieldErrors)
    }
    const acceptBaseUrl = corsAllowlist(c.env)[0] ?? 'http://localhost:5173'
    const invitation = await invitationsService.createInvitation(c.get('db')!, {
      orgId: c.get('orgId')!,
      inviterUserId: c.get('subject')!,
      inviterOrgRole: orgRole,
      email: parsed.data.email,
      role: parsed.data.role,
      acceptBaseUrl,
      emailPort: resolveEmailPort(c.env),
    })
    c.header('Location', `/api/orgs/${c.get('orgId')}/invitations/${invitation.id}`)
    return c.json({ invitation, requestId: c.get('requestId') }, 201)
  },
)

orgsRoutes.get(
  '/api/orgs/:orgId/invitations',
  requireOrgContext(),
  requireOrgCapability('manage_members'),
  async (c) => {
    const statusParam = c.req.query('status')
    const status =
      statusParam === 'accepted' || statusParam === 'canceled' || statusParam === 'pending'
        ? statusParam
        : 'pending'
    const invitations = await invitationsService.listInvitations(
      c.get('db')!,
      c.get('orgId')!,
      status,
    )
    return c.json({ invitations, requestId: c.get('requestId') })
  },
)

orgsRoutes.delete(
  '/api/orgs/:orgId/invitations/:invitationId',
  requireOrgContext(),
  requireOrgCapability('manage_members'),
  async (c) => {
    if (c.get('authMethod') !== 'session') {
      throw AppError.forbidden('Canceling invitations requires a session cookie')
    }
    await invitationsService.cancelInvitation(
      c.get('db')!,
      c.get('orgId')!,
      c.req.param('invitationId'),
    )
    return c.json({ ok: true, requestId: c.get('requestId') })
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

/** Phase B — list system + custom roles with module grants. */
orgsRoutes.get(
  '/api/orgs/:orgId/roles',
  requireOrgContext({ allowSuperAdmin: true }),
  requireOrgCapability('manage_members'),
  async (c) => {
    const db = c.get('db')!
    const roles = await orgRolesService.listRolesWithGrants(db, c.get('orgId')!)
    return c.json({ roles, requestId: c.get('requestId') })
  },
)

orgsRoutes.post(
  '/api/orgs/:orgId/roles',
  requireOrgContext(),
  requireOrgCapability('manage_members'),
  async (c) => {
    if (c.get('authMethod') !== 'session') {
      throw AppError.forbidden('Role management requires a session')
    }
    const orgRole = c.get('orgRole')
    if (!orgRole) throw AppError.forbidden('Organization role required')
    const parsed = createRoleSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      throw AppError.validation('Invalid role payload', parsed.error.flatten().fieldErrors)
    }
    const db = c.get('db')!
    const role = await orgRolesService.createCustomRole(db, {
      organizationId: c.get('orgId')!,
      key: parsed.data.key,
      name: parsed.data.name,
      grants: parsed.data.grants,
      actorRoleKey: orgRole,
    })
    return c.json({ role, requestId: c.get('requestId') }, 201)
  },
)

orgsRoutes.patch(
  '/api/orgs/:orgId/roles/:roleId/grants/:moduleId',
  requireOrgContext(),
  requireOrgCapability('manage_members'),
  async (c) => {
    if (c.get('authMethod') !== 'session') {
      throw AppError.forbidden('Role management requires a session')
    }
    const orgRole = c.get('orgRole')
    if (!orgRole) throw AppError.forbidden('Organization role required')
    const parsed = patchGrantSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      throw AppError.validation('Invalid grant payload', parsed.error.flatten().fieldErrors)
    }
    const db = c.get('db')!
    const role = await orgRolesService.setRoleGrant(db, {
      organizationId: c.get('orgId')!,
      roleId: c.req.param('roleId'),
      moduleId: c.req.param('moduleId'),
      access: parsed.data.access,
      actorRoleKey: orgRole,
    })
    return c.json({ role, requestId: c.get('requestId') })
  },
)

orgsRoutes.delete(
  '/api/orgs/:orgId/roles/:roleId',
  requireOrgContext(),
  requireOrgCapability('manage_members'),
  async (c) => {
    if (c.get('authMethod') !== 'session') {
      throw AppError.forbidden('Role management requires a session')
    }
    const db = c.get('db')!
    await orgRolesService.deleteCustomRole(db, c.get('orgId')!, c.req.param('roleId'))
    return c.json({ ok: true, requestId: c.get('requestId') })
  },
)

orgsRoutes.get('/api/platform/modules', requirePlatformRole('super_admin', 'staff'), async (c) => {
  const db = c.get('db')!
  const modules = await platformModulesService.listPlatformPublic(db)
  return c.json({ modules, requestId: c.get('requestId') })
})

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
