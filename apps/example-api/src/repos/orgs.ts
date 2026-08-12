import { and, eq, inArray } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { baMember, baOrganization } from '../db/better-auth-schema'
import type { schema } from '../db/schema'

type Db = DrizzleD1Database<typeof schema>

export async function findOrgById(db: Db, orgId: string) {
  const rows = await db.select().from(baOrganization).where(eq(baOrganization.id, orgId)).limit(1)
  return rows[0] ?? null
}

export async function findOrgBySlug(db: Db, slug: string) {
  const rows = await db.select().from(baOrganization).where(eq(baOrganization.slug, slug)).limit(1)
  return rows[0] ?? null
}

export async function listMembershipsForUser(db: Db, userId: string) {
  return db
    .select({
      memberId: baMember.id,
      role: baMember.role,
      organizationId: baMember.organizationId,
      orgName: baOrganization.name,
      orgSlug: baOrganization.slug,
      orgKind: baOrganization.kind,
      orgStatus: baOrganization.status,
    })
    .from(baMember)
    .innerJoin(baOrganization, eq(baMember.organizationId, baOrganization.id))
    .where(eq(baMember.userId, userId))
}

export async function findMembership(db: Db, orgId: string, userId: string) {
  const rows = await db
    .select()
    .from(baMember)
    .where(and(eq(baMember.organizationId, orgId), eq(baMember.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}

export async function listMembers(db: Db, orgId: string) {
  return db.select().from(baMember).where(eq(baMember.organizationId, orgId))
}

/** Batch members across orgs (avoids N+1 when scoping staff admin directory). */
export async function listMembersInOrgs(db: Db, orgIds: string[]) {
  if (orgIds.length === 0) return []
  return db.select().from(baMember).where(inArray(baMember.organizationId, orgIds))
}

export async function listAllOrgs(db: Db) {
  return db.select().from(baOrganization)
}

export async function insertOrganization(
  db: Db,
  row: {
    id: string
    name: string
    slug: string
    kind: string
    status: string
    createdAt: Date
  },
) {
  await db.insert(baOrganization).values({
    id: row.id,
    name: row.name,
    slug: row.slug,
    kind: row.kind,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
  })
}

export async function insertMember(
  db: Db,
  row: {
    id: string
    organizationId: string
    userId: string
    role: string
    createdAt: Date
  },
) {
  await db.insert(baMember).values(row)
}
