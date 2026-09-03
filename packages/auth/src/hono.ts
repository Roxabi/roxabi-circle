import { AppError } from '@kit/core'
import type { MiddlewareHandler } from 'hono'
import { type OrgRoleKey, type PlatformRole, roleAtLeast, roleHasCapability } from './org-roles'

export type OrgContextOpts = {
  /** Super_admin may read without membership (audit logged). */
  allowSuperAdmin?: boolean
  /** Super_admin may write without membership — default false (ADR-0003 D9). */
  allowSuperAdminWrite?: boolean
}

export type OrgMiddlewareVariables = {
  subject?: string
  authMethod?: 'session' | 'api_key'
  keyOrganizationId?: string | null
  requestId?: string
  db?: unknown
  orgId?: string
  orgRole?: string
  orgBypass?: boolean
  platformRole?: PlatformRole | null
}

export type OrgMiddlewareEnv = {
  Variables: OrgMiddlewareVariables
}

export type OrgContextPorts = {
  findOrgById(db: unknown, orgId: string): Promise<{ status: string } | null>
  findMembership(db: unknown, orgId: string, subject: string): Promise<{ role: OrgRoleKey } | null>
  getPlatformRole(db: unknown, subject: string): Promise<PlatformRole | null>
  resolveModuleAccess(
    db: unknown,
    input: {
      organizationId: string
      roleKey: string | undefined
      moduleId: string
      op: 'read' | 'write'
      orgBypass?: boolean
    },
  ): Promise<boolean>
  isModuleEffective(db: unknown, orgId: string, moduleId: string): Promise<boolean>
}

function dbOf(c: { get: (k: 'db') => unknown | undefined }): unknown {
  const db = c.get('db')
  if (!db) throw AppError.internal('db not bound')
  return db
}

function isSafeMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
}

export function createOrgMiddleware(ports: OrgContextPorts) {
  function requireOrgContext(opts: OrgContextOpts = {}): MiddlewareHandler<OrgMiddlewareEnv> {
    return async (c, next) => {
      const subject = c.get('subject')
      if (!subject) throw AppError.unauthorized()

      const pathOrg = c.req.param('orgId')?.trim()
      const headerOrg = c.req.header('x-org-id')?.trim()
      const orgId = pathOrg || headerOrg
      if (!orgId) {
        throw AppError.validation('organization id required (path or X-Org-Id)')
      }
      if (pathOrg && headerOrg && pathOrg !== headerOrg) {
        throw AppError.forbidden('organization id mismatch')
      }

      if (c.get('authMethod') === 'api_key') {
        const keyOrg = c.get('keyOrganizationId')
        if (!keyOrg) {
          throw AppError.forbidden('API key must be organization-bound for tenant routes')
        }
        if (keyOrg !== orgId) {
          throw AppError.forbidden('API key is bound to a different organization')
        }
      }

      const db = dbOf(c)
      const org = await ports.findOrgById(db, orgId)
      if (!org) throw AppError.notFound('Organization not found')
      if (org.status !== 'active') {
        throw AppError.forbidden('Organization is not active')
      }

      const platformRole = await ports.getPlatformRole(db, subject)
      c.set('platformRole', platformRole)

      const membership = await ports.findMembership(db, orgId, subject)
      if (membership) {
        c.set('orgId', orgId)
        c.set('orgRole', membership.role)
        c.set('orgBypass', false)
        await next()
        return
      }

      const method = c.req.method
      if (platformRole === 'super_admin') {
        if (isSafeMethod(method) && opts.allowSuperAdmin) {
          c.set('orgId', orgId)
          c.set('orgBypass', true)
          console.info(
            JSON.stringify({
              level: 'info',
              msg: 'super_admin_org_bypass',
              action: 'read',
              actor: subject,
              orgId,
              requestId: c.get('requestId'),
            }),
          )
          await next()
          return
        }
        if (!isSafeMethod(method) && opts.allowSuperAdminWrite) {
          c.set('orgId', orgId)
          c.set('orgBypass', true)
          console.info(
            JSON.stringify({
              level: 'info',
              msg: 'super_admin_org_bypass',
              action: 'write',
              actor: subject,
              orgId,
              requestId: c.get('requestId'),
            }),
          )
          await next()
          return
        }
        if (!isSafeMethod(method) && opts.allowSuperAdmin && !opts.allowSuperAdminWrite) {
          throw AppError.forbidden('Super admin write requires break-glass flag')
        }
      }

      throw AppError.notFound('Organization not found')
    }
  }

  function requireOrgRole(min: OrgRoleKey): MiddlewareHandler<OrgMiddlewareEnv> {
    return async (c, next) => {
      if (c.get('orgBypass')) {
        await next()
        return
      }
      const role = c.get('orgRole')
      if (!role || !roleAtLeast(role, min)) {
        throw AppError.forbidden('Insufficient organization role')
      }
      await next()
    }
  }

  function requireOrgCapability(
    capability: 'read' | 'write' | 'manage_members' | 'manage_modules' | 'delete_org',
  ): MiddlewareHandler<OrgMiddlewareEnv> {
    return async (c, next) => {
      if (c.get('orgBypass')) {
        if (capability === 'delete_org') {
          throw AppError.forbidden('Super admin cannot delete organization via break-glass')
        }
        await next()
        return
      }
      const role = c.get('orgRole')
      if (!role || !roleHasCapability(role, capability)) {
        throw AppError.forbidden('Insufficient organization capability')
      }
      await next()
    }
  }

  function requirePlatformRole(...roles: PlatformRole[]): MiddlewareHandler<OrgMiddlewareEnv> {
    const allowed =
      roles.length === 1 && Array.isArray(roles[0]) ? (roles[0] as PlatformRole[]) : roles
    return async (c, next) => {
      const subject = c.get('subject')
      if (!subject) throw AppError.unauthorized()
      const db = dbOf(c)
      const role = await ports.getPlatformRole(db, subject)
      c.set('platformRole', role)
      if (!role || !allowed.includes(role)) {
        throw AppError.forbidden('Platform role required')
      }
      await next()
    }
  }

  function requireModule(
    moduleId: string,
    op: 'read' | 'write' = 'read',
  ): MiddlewareHandler<OrgMiddlewareEnv> {
    return async (c, next) => {
      const orgId = c.get('orgId')
      if (!orgId) throw AppError.forbidden('Organization context required')
      const db = dbOf(c)
      const allowed = await ports.resolveModuleAccess(db, {
        organizationId: orgId,
        roleKey: c.get('orgRole'),
        moduleId,
        op,
        orgBypass: Boolean(c.get('orgBypass')),
      })
      if (!allowed) {
        const platformOk = await ports.isModuleEffective(db, orgId, moduleId)
        if (!platformOk) throw AppError.notFound('Module not available')
        throw AppError.forbidden('Insufficient module grant')
      }
      await next()
    }
  }

  return {
    requireOrgContext,
    requireOrgRole,
    requireOrgCapability,
    requirePlatformRole,
    requireModule,
  }
}
