import { and, desc, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { flowPlans, flowRuns, type schema } from '../db/schema'

type Db = DrizzleD1Database<typeof schema>

export async function listPlansForOrg(db: Db, orgId: string) {
  return db
    .select()
    .from(flowPlans)
    .where(eq(flowPlans.orgId, orgId))
    .orderBy(desc(flowPlans.createdAt))
    .all()
}

export async function getPlan(db: Db, id: string, orgId: string) {
  const rows = await db
    .select()
    .from(flowPlans)
    .where(and(eq(flowPlans.id, id), eq(flowPlans.orgId, orgId)))
    .all()
  return rows[0] ?? null
}

export async function listRunsForOrg(db: Db, orgId: string) {
  return db
    .select()
    .from(flowRuns)
    .where(eq(flowRuns.orgId, orgId))
    .orderBy(desc(flowRuns.createdAt))
    .all()
}

export async function getRun(db: Db, id: string, orgId: string) {
  const rows = await db
    .select()
    .from(flowRuns)
    .where(and(eq(flowRuns.id, id), eq(flowRuns.orgId, orgId)))
    .all()
  return rows[0] ?? null
}

export async function insertPlan(db: Db, row: typeof flowPlans.$inferInsert) {
  await db.insert(flowPlans).values(row).run()
  return row
}

export async function getPlanByOrgKeyVersion(
  db: Db,
  orgId: string,
  planKey: string,
  version: number,
) {
  const rows = await db
    .select()
    .from(flowPlans)
    .where(
      and(
        eq(flowPlans.orgId, orgId),
        eq(flowPlans.planKey, planKey),
        eq(flowPlans.version, version),
      ),
    )
    .all()
  return rows[0] ?? null
}

export async function setPlanEnabled(
  db: Db,
  input: { id: string; orgId: string; enabled: boolean },
) {
  await db
    .update(flowPlans)
    .set({ enabled: input.enabled, updatedAt: Date.now() })
    .where(and(eq(flowPlans.id, input.id), eq(flowPlans.orgId, input.orgId)))
    .run()
}

export async function insertQueuedRun(db: Db, row: typeof flowRuns.$inferInsert) {
  await db.insert(flowRuns).values(row).run()
  return row
}

export async function markQueuedRunCreateFailed(db: Db, input: { id: string; orgId: string }) {
  const result = await db
    .update(flowRuns)
    .set({
      status: 'failed',
      errorCode: 'WORKFLOW_CREATE_FAILED',
      updatedAt: Date.now(),
    })
    .where(
      and(
        eq(flowRuns.id, input.id),
        eq(flowRuns.orgId, input.orgId),
        eq(flowRuns.status, 'queued'),
      ),
    )
    .run()
  return (result.meta.changes ?? 0) > 0
}
