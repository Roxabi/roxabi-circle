import { type OrgRoleKey, type PlatformRole, roleAtLeast, roleHasCapability } from '@gosilex/auth'
import { AppError } from '@gosilex/core'
import type { MiddlewareHandler } from 'hono'
import type { KitDb } from '../lib/db-type'
import * as orgsRepo from '../repos/orgs'
import * as platformRolesRepo from '../repos/platform-roles'
import type { AppEnv } from '../types'

function dbOf(c: { get: (k: 'db') => KitDb | undefined }): KitDb {
  const db = c.get('db')
  if (!db) throw AppError.internal('db not bound')
  return db
}

export type OrgContextOpts = {
  /** Super_admin may read without membership (audited by caller). */
  allowSuperAdmin?: boolean
  /** Super_admin may write without membership — default false (ADR-0003). */
  allowSuperAdminWrite?: boolean
}

/**
 * Resolve org id: path param `orgId` > header `X-Org-Id` > (optional) BA active org later.
 * Fail closed on mismatch / inactive org / missing membership.
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

    const wantWrite = opts.allowSuperAdminWrite === true
    const wantRead = opts.allowSuperAdmin === true || wantWrite
    if (platformRole === 'super_admin' && wantRead) {
      if (wantWrite || c.req.method === 'GET' || c.req.method === 'HEAD') {
        if (wantWrite || opts.allowSuperAdmin) {
          // write only if allowSuperAdminWrite
          if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && !opts.allowSuperAdminWrite) {
            throw AppError.forbidden('Super admin write requires break-glass flag')
          }
          c.set('orgId', orgId)
          c.set('orgRole', 'owner')
          c.set('orgBypass', true)
          await next()
          return
        }
      }
      if (opts.allowSuperAdmin && ['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
        c.set('orgId', orgId)
        c.set('orgRole', 'owner')
        c.set('orgBypass', true)
        await next()
        return
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
    if (c.get('orgBypass') && capability !== 'delete_org') {
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

export function requirePlatformRole(min: PlatformRole | PlatformRole[]): MiddlewareHandler<AppEnv> {
  const allowed = Array.isArray(min) ? min : [min]
  return async (c, next) => {
    const subject = c.get('subject')
    if (!subject) throw AppError.unauthorized()
    const db = dbOf(c)
    const role = await platformRolesRepo.getPlatformRole(db, subject)
    c.set('platformRole', role)
    if (!role || !allowed.includes(role)) {
      throw AppError.forbidden('Platform role required')
    }
    // staff is not super_admin
    if (allowed.includes('super_admin') && role !== 'super_admin' && allowed.length === 1) {
      throw AppError.forbidden('Super admin required')
    }
    if (min === 'super_admin' && role !== 'super_admin') {
      throw AppError.forbidden('Super admin required')
    }
    await next()
  }
}
