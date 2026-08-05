import { type OrgRoleKey, type PlatformRole, roleAtLeast, roleHasCapability } from '@kit/auth'
import { AppError } from '@kit/core'
import type { MiddlewareHandler } from 'hono'
import type { KitDb } from '../lib/db-type'
import type { KitModuleId } from '../lib/kit-modules'
import * as orgsRepo from '../repos/orgs'
import * as platformRolesRepo from '../repos/platform-roles'
import * as orgRolesService from '../services/org-roles'
import * as platformModulesService from '../services/platform-modules'
import type { AppEnv } from '../types'

function dbOf(c: { get: (k: 'db') => KitDb | undefined }): KitDb {
  const db = c.get('db')
  if (!db) throw AppError.internal('db not bound')
  return db
}

function isSafeMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
}

export type OrgContextOpts = {
  /** Super_admin may read without membership (audit logged). */
  allowSuperAdmin?: boolean
  /** Super_admin may write without membership — default false (ADR-0003 D9). */
  allowSuperAdminWrite?: boolean
}

/**
 * Resolve org id: path param `orgId` > header `X-Org-Id`.
 * Fail closed on mismatch / inactive org / missing membership.
 * API keys: path/header org must equal keyOrganizationId (D11).
 */
export function requireOrgContext(opts: OrgContextOpts = {}): MiddlewareHandler<AppEnv> {
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

    // D11 — tenant routes require org-bound keys; no hop across memberships
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
    const org = await orgsRepo.findOrgById(db, orgId)
    if (!org) throw AppError.notFound('Organization not found')
    if (org.status !== 'active') {
      throw AppError.forbidden('Organization is not active')
    }

    const platformRole = await platformRolesRepo.getPlatformRole(db, subject)
    c.set('platformRole', platformRole)

    const membership = await orgsRepo.findMembership(db, orgId, subject)
    if (membership) {
      c.set('orgId', orgId)
      c.set('orgRole', membership.role)
      c.set('orgBypass', false)
      await next()
      return
    }

    // Super_admin break-glass (no synthetic membership role)
    const method = c.req.method
    if (platformRole === 'super_admin') {
      if (isSafeMethod(method) && opts.allowSuperAdmin) {
        c.set('orgId', orgId)
        c.set('orgBypass', true)
        // do not set orgRole — capabilities use orgBypass only
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

export function requireOrgRole(min: OrgRoleKey): MiddlewareHandler<AppEnv> {
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

export function requireOrgCapability(
  capability: 'read' | 'write' | 'manage_members' | 'manage_modules' | 'delete_org',
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (c.get('orgBypass')) {
      // Super_admin bypass never grants delete_org (no break-glass path for delete)
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

export function requirePlatformRole(...roles: PlatformRole[]): MiddlewareHandler<AppEnv> {
  const allowed =
    roles.length === 1 && Array.isArray(roles[0]) ? (roles[0] as PlatformRole[]) : roles
  return async (c, next) => {
    const subject = c.get('subject')
    if (!subject) throw AppError.unauthorized()
    const db = dbOf(c)
    const role = await platformRolesRepo.getPlatformRole(db, subject)
    c.set('platformRole', role)
    if (!role || !allowed.includes(role)) {
      throw AppError.forbidden('Platform role required')
    }
    await next()
  }
}

/**
 * ADR-0003 Phase B — single runtime resolver:
 * platform.available ∧ org.enabled ∧ role grant (write|read|disabled).
 * Phase A code capability matrix is seed-only (no dual path).
 */
export function requireModule(
  moduleId: KitModuleId,
  op: 'read' | 'write' = 'read',
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const orgId = c.get('orgId')
    if (!orgId) throw AppError.forbidden('Organization context required')
    const db = dbOf(c)
    const allowed = await orgRolesService.resolveModuleAccess(db, {
      organizationId: orgId,
      roleKey: c.get('orgRole'),
      moduleId,
      op,
      orgBypass: Boolean(c.get('orgBypass')),
    })
    if (!allowed) {
      // Hide module existence when platform/org off; forbid when grant missing/disabled
      const platformOk = await platformModulesService.isModuleEffective(db, orgId, moduleId)
      if (!platformOk) throw AppError.notFound('Module not available')
      throw AppError.forbidden('Insufficient module grant')
    }
    await next()
  }
}
