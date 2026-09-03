import { and, asc, eq, inArray } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { kitTaskAssignees, kitTaskLinks, kitTaskStages, kitTasks } from './drizzle-schema'

type Db = DrizzleD1Database<Record<string, unknown>>

export async function listStages(db: Db, orgId: string, boardKey?: string) {
  if (boardKey) {
    return db
      .select()
      .from(kitTaskStages)
      .where(and(eq(kitTaskStages.orgId, orgId), eq(kitTaskStages.boardKey, boardKey)))
      .orderBy(asc(kitTaskStages.position))
      .all()
  }
  return db
    .select()
    .from(kitTaskStages)
    .where(eq(kitTaskStages.orgId, orgId))
    .orderBy(asc(kitTaskStages.position))
    .all()
}

export async function insertStage(db: Db, row: typeof kitTaskStages.$inferInsert) {
  await db.insert(kitTaskStages).values(row).run()
  return row
}

export async function listTasks(db: Db, orgId: string) {
  return db.select().from(kitTasks).where(eq(kitTasks.orgId, orgId)).all()
}

export async function getTask(db: Db, orgId: string, id: string) {
  const rows = await db
    .select()
    .from(kitTasks)
    .where(and(eq(kitTasks.orgId, orgId), eq(kitTasks.id, id)))
    .all()
  return rows[0] ?? null
}

export async function insertTask(db: Db, row: typeof kitTasks.$inferInsert) {
  await db.insert(kitTasks).values(row).run()
  return row
}

export async function updateTask(
  db: Db,
  orgId: string,
  id: string,
  patch: Partial<typeof kitTasks.$inferInsert>,
) {
  await db
    .update(kitTasks)
    .set(patch)
    .where(and(eq(kitTasks.orgId, orgId), eq(kitTasks.id, id)))
    .run()
}

export async function deleteTask(db: Db, orgId: string, id: string) {
  await db.delete(kitTaskAssignees).where(eq(kitTaskAssignees.taskId, id)).run()
  await db
    .delete(kitTaskLinks)
    .where(
      and(
        eq(kitTaskLinks.orgId, orgId),
        // drizzle: delete where from or to — two deletes
        eq(kitTaskLinks.fromTaskId, id),
      ),
    )
    .run()
  await db
    .delete(kitTaskLinks)
    .where(and(eq(kitTaskLinks.orgId, orgId), eq(kitTaskLinks.toTaskId, id)))
    .run()
  await db
    .delete(kitTasks)
    .where(and(eq(kitTasks.orgId, orgId), eq(kitTasks.id, id)))
    .run()
}

export async function listAssigneesForTasks(db: Db, taskIds: string[]) {
  if (taskIds.length === 0) return []
  return db.select().from(kitTaskAssignees).where(inArray(kitTaskAssignees.taskId, taskIds)).all()
}

export async function replaceAssignees(db: Db, taskId: string, userIds: string[], now: number) {
  await db.delete(kitTaskAssignees).where(eq(kitTaskAssignees.taskId, taskId)).run()
  if (userIds.length === 0) return
  await db
    .insert(kitTaskAssignees)
    .values(userIds.map((userId) => ({ taskId, userId, createdAt: now })))
    .run()
}

export async function listLinks(db: Db, orgId: string) {
  return db.select().from(kitTaskLinks).where(eq(kitTaskLinks.orgId, orgId)).all()
}

export async function insertLink(db: Db, row: typeof kitTaskLinks.$inferInsert) {
  await db.insert(kitTaskLinks).values(row).run()
  return row
}

export async function deleteLink(db: Db, orgId: string, id: string) {
  await db
    .delete(kitTaskLinks)
    .where(and(eq(kitTaskLinks.orgId, orgId), eq(kitTaskLinks.id, id)))
    .run()
}
