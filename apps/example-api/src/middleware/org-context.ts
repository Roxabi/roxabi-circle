import type { OrgRoleKey } from '@kit/auth'
import { createOrgMiddleware, type OrgContextOpts, type OrgMiddlewareEnv } from '@kit/auth/hono'
import type { MiddlewareHandler } from 'hono'
import type { KitDb } from '../lib/db-type'
import type { KitModuleId } from '../lib/kit-modules'
import * as orgsRepo from '../repos/orgs'
import * as platformRolesRepo from '../repos/platform-roles'
import * as orgRolesService from '../services/org-roles'
import * as platformModulesService from '../services/platform-modules'
import type { AppEnv } from '../types'

const orgMiddleware = createOrgMiddleware({
  findOrgById: (db, orgId) => orgsRepo.findOrgById(db as KitDb, orgId),
  findMembership: async (db, orgId, subject) => {
    const membership = await orgsRepo.findMembership(db as KitDb, orgId, subject)
    if (!membership) return null
    return { role: membership.role as OrgRoleKey }
  },
  getPlatformRole: (db, subject) => platformRolesRepo.getPlatformRole(db as KitDb, subject),
  resolveModuleAccess: (db, input) => orgRolesService.resolveModuleAccess(db as KitDb, input),
  isModuleEffective: (db, orgId, moduleId) =>
    platformModulesService.isModuleEffective(db as KitDb, orgId, moduleId as KitModuleId),
})

export type { OrgContextOpts }

function asAppMiddleware(handler: MiddlewareHandler<OrgMiddlewareEnv>): MiddlewareHandler<AppEnv> {
  return handler as unknown as MiddlewareHandler<AppEnv>
}

export function requireOrgContext(opts: OrgContextOpts = {}): MiddlewareHandler<AppEnv> {
  return asAppMiddleware(orgMiddleware.requireOrgContext(opts))
}

export function requireOrgRole(min: OrgRoleKey): MiddlewareHandler<AppEnv> {
  return asAppMiddleware(orgMiddleware.requireOrgRole(min))
}

export function requireOrgCapability(
  capability: 'read' | 'write' | 'manage_members' | 'manage_modules' | 'delete_org',
): MiddlewareHandler<AppEnv> {
  return asAppMiddleware(orgMiddleware.requireOrgCapability(capability))
}

export function requirePlatformRole(
  ...roles: import('@kit/auth').PlatformRole[]
): MiddlewareHandler<AppEnv> {
  return asAppMiddleware(orgMiddleware.requirePlatformRole(...roles))
}

export function requireModule(
  moduleId: KitModuleId,
  op: 'read' | 'write' = 'read',
): MiddlewareHandler<AppEnv> {
  return asAppMiddleware(orgMiddleware.requireModule(moduleId, op))
}
