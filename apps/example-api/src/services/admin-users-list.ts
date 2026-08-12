/**
 * Admin user directory list — staff-scoped (shared orgs) vs super_admin full catalogue.
 * Staff scope is applied **before** limit/offset (not filter-after-page).
 */
import type { PlatformRole } from '@kit/auth'
import { AppError } from '@kit/core'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { schema } from '../db/schema'
import * as orgsRepo from '../repos/orgs'
import * as platformRolesRepo from '../repos/platform-roles'
import * as usersRepo from '../repos/users'

type Db = DrizzleD1Database<typeof schema>

export type ListAdminUsersInput = {
  actorUserId: string
  actorPlatformRole: PlatformRole
  q?: string
  limit?: number
  offset?: number
}

/**
 * List BA users for the admin directory.
 * - super_admin: full platform directory
 * - staff: only users who share ≥1 org membership with the actor (privacy / IDOR)
 */
export async function listAdminUsers(db: Db, input: ListAdminUsersInput) {
  if (input.actorPlatformRole !== 'super_admin' && input.actorPlatformRole !== 'staff') {
    throw AppError.forbidden('Platform role required')
  }

  let userIds: string[] | undefined
  if (input.actorPlatformRole === 'staff') {
    const actorOrgs = await orgsRepo.listMembershipsForUser(db, input.actorUserId)
    const orgIds = actorOrgs.map((m) => m.organizationId)
    const members = await orgsRepo.listMembersInOrgs(db, orgIds)
    const allowed = new Set<string>()
    for (const mem of members) {
      allowed.add(mem.userId)
    }
    userIds = [...allowed]
  }

  const rows = await usersRepo.listBaUsers(db, {
    q: input.q,
    limit: input.limit,
    offset: input.offset,
    userIds,
  })

  const rolesByUser = await platformRolesRepo.getPlatformRolesForUsers(
    db,
    rows.map((r) => r.id),
  )

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    platformRole: rolesByUser.get(r.id) ?? null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }))
}
