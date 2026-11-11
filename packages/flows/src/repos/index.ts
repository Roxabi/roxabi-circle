import { isUniqueConstraintError } from '@kit/db'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { flowPlans, flowRunApprovals, flowRuns } from '../drizzle-schema'
import { appendReceiptEvents, insertFlowRunEvent } from './events'

export type { FlowRunEventKind, FlowRunEventRow } from './events'
export { insertFlowRunEvent, listFlowRunEvents, markQueuedRunCreateFailed } from './events'

import { FLOW_RUN_STATUSES } from '../receipts'

export { cancelRun } from './cancel'

type Db = DrizzleD1Database<Record<string, unknown>>

/** Row getters return null on miss (keeps `if (row)` live under loose indexed access). */
export type FlowPlanRow = typeof flowPlans.$inferSelect
export type FlowRunRow = typeof flowRuns.$inferSelect

export async function listPlansForOrg(db: Db, orgId: string) {
  return db
    .select()
    .from(flowPlans)
    .where(eq(flowPlans.orgId, orgId))
    .orderBy(desc(flowPlans.createdAt))
    .all()
}

export async function getPlan(db: Db, id: string, orgId: string): Promise<FlowPlanRow | null> {
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

export async function getRun(db: Db, id: string, orgId: string): Promise<FlowRunRow | null> {
  const rows = await db
    .select()
    .from(flowRuns)
    .where(and(eq(flowRuns.id, id), eq(flowRuns.orgId, orgId)))
    .all()
  return rows[0] ?? null
}

export type InsertPlanResult = { ok: true } | { ok: false; reason: 'conflict' }

export async function insertPlan(
  db: Db,
  row: typeof flowPlans.$inferInsert,
): Promise<InsertPlanResult> {
  try {
    await db.insert(flowPlans).values(row).run()
  } catch (err) {
    if (isUniqueConstraintError(err)) return { ok: false, reason: 'conflict' }
    throw err
  }
  return { ok: true }
}

export async function getPlanByOrgKeyVersion(
  db: Db,
  orgId: string,
  planKey: string,
  version: number,
): Promise<FlowPlanRow | null> {
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

export {
  getLowestPlanVersionByBytes,
  type InsertPlanVersionResult,
  insertPlanVersionIfNewBytes,
  type NewPlanVersion,
} from '../plan-versions'

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
  if (result.meta.changes === 1) {
    await insertFlowRunEvent(db, {
      orgId: input.orgId,
      runId: input.runId,
      kind: 'status',
      statusFrom: 'queued',
      statusTo: 'running',
      now,
    })
    return 1
  }
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
  const before = await getRun(db, input.runId, input.orgId)
  if (!before) return 0
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
  if ((result.meta.changes ?? 0) !== 1) return result.meta.changes ?? 0
  if (before.status !== input.status) {
    await insertFlowRunEvent(db, {
      orgId: input.orgId,
      runId: input.runId,
      kind: 'status',
      statusFrom: before.status,
      statusTo: input.status,
      errorCode: input.errorCode ?? null,
      now,
    })
  }
  await appendReceiptEvents(db, {
    orgId: input.orgId,
    runId: input.runId,
    beforeJson: before.receiptJson,
    afterJson: input.receiptJson,
    now,
  })
  return 1
}

export type FlowRunApprovalRow = typeof flowRunApprovals.$inferSelect

export type RecordRunApprovalResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'not_waiting' | 'conflict' }

/**
 * One conditional insert. The run row must match org, be running, and the task
 * receipt must still be waiting. A second decision is `conflict`, not a throw.
 */
export async function recordRunApproval(
  db: Db,
  input: {
    orgId: string
    runId: string
    taskId: string
    decision: 'approved' | 'rejected' | 'expired'
    decidedBy: string
    now?: number
  },
): Promise<RecordRunApprovalResult> {
  const id = `appr_${crypto.randomUUID().replace(/-/g, '')}`
  const now = input.now ?? Date.now()
  try {
    const result = await db.run(sql`
      INSERT INTO flow_run_approvals (id, org_id, run_id, task_id, decision, decided_by, decided_at)
      SELECT ${id}, r.org_id, r.id, ${input.taskId}, ${input.decision}, ${input.decidedBy}, ${now}
      FROM flow_runs r
      WHERE r.id = ${input.runId}
        AND r.org_id = ${input.orgId}
                AND r.status = 'running'
        AND EXISTS (
          SELECT 1 FROM json_each(json_extract(r.receipt_json, '$.tasks')) AS t
          WHERE t.key = ${input.taskId}
            AND json_extract(t.value, '$.outcome') = 'waiting'
        )
    `)
    if ((result.meta.changes ?? 0) > 0) return { ok: true }
  } catch (err) {
    if (isUniqueConstraintError(err)) return { ok: false, reason: 'conflict' }
    throw err
  }
  const run = await getRun(db, input.runId, input.orgId)
  if (!run) return { ok: false, reason: 'not_found' }
  return { ok: false, reason: 'not_waiting' }
}

/** Misses a row for another org or run. */
export async function getRunApproval(
  db: Db,
  input: { orgId: string; runId: string; taskId: string },
): Promise<FlowRunApprovalRow | null> {
  const rows = await db
    .select()
    .from(flowRunApprovals)
    .where(
      and(
        eq(flowRunApprovals.orgId, input.orgId),
        eq(flowRunApprovals.runId, input.runId),
        eq(flowRunApprovals.taskId, input.taskId),
      ),
    )
    .all()
  return rows[0] ?? null
}
