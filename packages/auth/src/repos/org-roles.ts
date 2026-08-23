import { and, eq } from 'drizzle-orm'
import { organizationRoleModuleGrants, organizationRoles } from '../tenancy-schema'
import type { KitRepoDb } from './db-type'

type Db = KitRepoDb

export async function listRolesForOrg(db: Db, organizationId: string) {
  return db
    .select()
    .from(organizationRoles)
    .where(eq(organizationRoles.organizationId, organizationId))
    .all()
}

export async function findRoleById(db: Db, roleId: string) {
  const rows = await db
    .select()
    .from(organizationRoles)
    .where(eq(organizationRoles.id, roleId))
    .limit(1)
    .all()
  return rows[0] ?? null
}

export async function findRoleByKey(db: Db, organizationId: string, key: string) {
  const rows = await db
    .select()
    .from(organizationRoles)
    .where(
      and(eq(organizationRoles.organizationId, organizationId), eq(organizationRoles.key, key)),
    )
    .limit(1)
    .all()
  return rows[0] ?? null
}

export async function insertRole(
  db: Db,
  row: {
    id: string
    organizationId: string
    key: string
    name: string
    isSystem: boolean
    createdAt: number
  },
) {
  await db.insert(organizationRoles).values(row).run()
}

export async function deleteRole(db: Db, roleId: string) {
  await db
    .delete(organizationRoleModuleGrants)
    .where(eq(organizationRoleModuleGrants.roleId, roleId))
    .run()
  await db.delete(organizationRoles).where(eq(organizationRoles.id, roleId)).run()
}

export async function listGrantsForRole(db: Db, roleId: string) {
  return db
    .select()
    .from(organizationRoleModuleGrants)
    .where(eq(organizationRoleModuleGrants.roleId, roleId))
    .all()
}

export async function listGrantsForRoles(db: Db, roleIds: string[]) {
  if (roleIds.length === 0) return []
  const all = await Promise.all(roleIds.map((id) => listGrantsForRole(db, id)))
  return all.flat()
}

export async function upsertGrant(
  db: Db,
  row: { roleId: string; moduleId: string; access: string },
) {
  await db
    .insert(organizationRoleModuleGrants)
    .values(row)
    .onConflictDoUpdate({
      target: [organizationRoleModuleGrants.roleId, organizationRoleModuleGrants.moduleId],
      set: { access: row.access },
    })
    .run()
}

export async function deleteGrant(db: Db, roleId: string, moduleId: string) {
  await db
    .delete(organizationRoleModuleGrants)
    .where(
      and(
        eq(organizationRoleModuleGrants.roleId, roleId),
        eq(organizationRoleModuleGrants.moduleId, moduleId),
      ),
    )
    .run()
}
