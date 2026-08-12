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
    const allowed = new Set<string>()
    for (const m of actorOrgs) {
      const members = await orgsRepo.listMembers(db, m.organizationId)
      for (const mem of members) {
        allowed.add(mem.userId)
      }
    }
    userIds = [...allowed]
  }

  const rows = await usersRepo.listBaUsers(db, {
    q: input.q,
    limit: input.limit,
    offset: input.offset,
    userIds,
  })

  const out: {
    id: string
    email: string
    name: string
    platformRole: PlatformRole | null
    createdAt: string
  }[] = []
  for (const r of rows) {
    const platformRole = await platformRolesRepo.getPlatformRole(db, r.id)
    out.push({
      id: r.id,
      email: r.email,
      name: r.name,
      platformRole,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    })
  }
  return out
}
