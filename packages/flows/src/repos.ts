import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { flowPlans, flowRuns } from './drizzle-schema'
import { FLOW_RUN_STATUSES } from './receipts'

type Db = DrizzleD1Database<Record<string, unknown>>

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

/** Insert queued only if the plan is still enabled (closes disable TOCTOU). */
export async function insertQueuedRunIfPlanEnabled(
  db: Db,
  row: {
    id: string
    orgId: string
    planId: string
    actorId: string
    snapshotJson: string
    createdAt: number
    updatedAt: number
  },
): Promise<boolean> {
  const result = await db.run(sql`
    INSERT INTO flow_runs (
      id, org_id, plan_id, plan_key, status, actor_id, snapshot_json, plan_digest, created_at, updated_at
    )
    SELECT
      ${row.id},
      ${row.orgId},
      id,
      plan_key,
      'queued',
      ${row.actorId},
      ${row.snapshotJson},
      plan_digest,
      ${row.createdAt},
      ${row.updatedAt}
    FROM flow_plans
    WHERE id = ${row.planId} AND org_id = ${row.orgId} AND enabled = 1
  `)
  return (result.meta.changes ?? 0) > 0
}

const DRIVER_STATUS_SET = new Set<string>(FLOW_RUN_STATUSES)

/** CAS queued → running, or no-op if this instance already owns the row. */
export async function claimRun(
  db: Db,
  input: { runId: string; orgId: string; instanceId: string; now?: number },
): Promise<number> {
  if (!input.instanceId || input.instanceId.length > 128) return 0
  const now = input.now ?? Date.now()
  const result = await db
    .update(flowRuns)
    .set({ status: 'running', workflowInstanceId: input.instanceId, updatedAt: now })
    .where(
      and(
        eq(flowRuns.id, input.runId),
        eq(flowRuns.orgId, input.orgId),
        eq(flowRuns.status, 'queued'),
      ),
    )
    .run()
  if (result.meta.changes === 1) return 1
  const row = await getRun(db, input.runId, input.orgId)
  if (row?.status === 'running' && row.workflowInstanceId === input.instanceId) return 1
  return 0
}

/** Writes receipts + rollup. Returns meta.changes (1 = wrote). */
export async function persistRunBundle(
  db: Db,
  input: {
    runId: string
    orgId: string
    status: string
    receiptJson: string
    errorCode?: string | null
    now?: number
  },
): Promise<number> {
  if (!DRIVER_STATUS_SET.has(input.status)) return 0
  const now = input.now ?? Date.now()
  const result = await db
    .update(flowRuns)
    .set({
      receiptJson: input.receiptJson,
      status: input.status,
      errorCode: input.errorCode ?? null,
      updatedAt: now,
    })
    .where(
      and(
        eq(flowRuns.id, input.runId),
        eq(flowRuns.orgId, input.orgId),
        inArray(flowRuns.status, ['queued', 'running']),
      ),
    )
    .run()
  return result.meta.changes
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
