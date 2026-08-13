import { and, desc, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { kitComments, type schema } from '../db/schema'

type Db = DrizzleD1Database<typeof schema>

export async function listByTarget(db: Db, orgId: string, targetType: string, targetId: string) {
  return db
    .select()
    .from(kitComments)
    .where(
      and(
        eq(kitComments.orgId, orgId),
        eq(kitComments.targetType, targetType),
        eq(kitComments.targetId, targetId),
      ),
    )
    .orderBy(desc(kitComments.createdAt))
    .all()
}

export async function getComment(db: Db, orgId: string, id: string) {
  const rows = await db
    .select()
    .from(kitComments)
    .where(and(eq(kitComments.orgId, orgId), eq(kitComments.id, id)))
    .all()
  return rows[0] ?? null
}

export async function insertComment(db: Db, row: typeof kitComments.$inferInsert) {
  await db.insert(kitComments).values(row).run()
  return row
}

export async function deleteComment(db: Db, orgId: string, id: string) {
  await db
    .delete(kitComments)
    .where(and(eq(kitComments.orgId, orgId), eq(kitComments.id, id)))
    .run()
}
