import { and, eq, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { flowRunEvents, flowRuns } from '../drizzle-schema'

type Db = DrizzleD1Database<Record<string, unknown>>

export type FlowRunEventRow = typeof flowRunEvents.$inferSelect

export type FlowRunEventKind = 'status' | 'receipt'

/** Append-only. Fails the caller if the insert fails — never a silent gap. */
export async function insertFlowRunEvent(
  db: Db,
  input: {
    orgId: string
    runId: string
    kind: FlowRunEventKind
    statusFrom?: string | null
    statusTo?: string | null
    taskId?: string | null
    outcome?: string | null
    errorCode?: string | null
    now?: number
  },
): Promise<void> {
  const now = input.now ?? Date.now()
  const id = `evt_${crypto.randomUUID().replace(/-/g, '')}`
  await db.run(sql`
    INSERT INTO flow_run_events (
      id, org_id, run_id, seq, kind, status_from, status_to, task_id, outcome, error_code, created_at
    )
    SELECT
      ${id},
      ${input.orgId},
      ${input.runId},
      COALESCE((SELECT MAX(seq) FROM flow_run_events WHERE run_id = ${input.runId}), 0) + 1,
      ${input.kind},
      ${input.statusFrom ?? null},
      ${input.statusTo ?? null},
      ${input.taskId ?? null},
      ${input.outcome ?? null},
      ${input.errorCode ?? null},
      ${now}
  `)
}

/** Always filters by org_id. Foreign org → empty. */
export async function listFlowRunEvents(
  db: Db,
  orgId: string,
  runId: string,
): Promise<FlowRunEventRow[]> {
  return db
    .select()
    .from(flowRunEvents)
    .where(and(eq(flowRunEvents.orgId, orgId), eq(flowRunEvents.runId, runId)))
    .orderBy(flowRunEvents.seq)
    .all()
}

type ReceiptTask = { taskId?: string; outcome?: string; errorCode?: string }

function receiptOutcome(task: ReceiptTask | undefined): {
  outcome: string | null
  errorCode: string | null
} {
  return {
    outcome: task && typeof task.outcome === 'string' ? task.outcome : null,
    errorCode: task && typeof task.errorCode === 'string' ? task.errorCode : null,
  }
}

export async function appendReceiptEvents(
  db: Db,
  input: {
    orgId: string
    runId: string
    beforeJson: string | null
    afterJson: string
    now: number
  },
): Promise<void> {
  const beforeTasks = parseReceiptTasks(input.beforeJson)
  const afterTasks = parseReceiptTasks(input.afterJson)
  for (const [taskId, after] of Object.entries(afterTasks)) {
    const next = receiptOutcome(after)
    if (!next.outcome) continue
    const prev = receiptOutcome(beforeTasks[taskId])
    if (prev.outcome === next.outcome && prev.errorCode === next.errorCode) continue
    await insertFlowRunEvent(db, {
      orgId: input.orgId,
      runId: input.runId,
      kind: 'receipt',
      taskId,
      outcome: next.outcome,
      errorCode: next.errorCode,
      now: input.now,
    })
  }
}

function parseReceiptTasks(raw: string | null): Record<string, ReceiptTask> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as { tasks?: Record<string, ReceiptTask> }
    return parsed.tasks && typeof parsed.tasks === 'object' ? parsed.tasks : {}
  } catch {
    return {}
  }
}

/** Receipt-only write. Keeps status and error_code; any current status. Org-scoped. */
export async function persistReceiptJson(
  db: Db,
  input: { runId: string; orgId: string; receiptJson: string; now?: number },
): Promise<number> {
  const now = input.now ?? Date.now()
  const before = await db
    .select()
    .from(flowRuns)
    .where(and(eq(flowRuns.id, input.runId), eq(flowRuns.orgId, input.orgId)))
    .all()
  const row = before[0]
  if (!row) return 0
  const result = await db
    .update(flowRuns)
    .set({ receiptJson: input.receiptJson, updatedAt: now })
    .where(and(eq(flowRuns.id, input.runId), eq(flowRuns.orgId, input.orgId)))
    .run()
  if ((result.meta.changes ?? 0) !== 1) return result.meta.changes ?? 0
  await appendReceiptEvents(db, {
    orgId: input.orgId,
    runId: input.runId,
    beforeJson: row.receiptJson,
    afterJson: input.receiptJson,
    now,
  })
  return 1
}

export async function markQueuedRunCreateFailed(db: Db, input: { id: string; orgId: string }) {
  const now = Date.now()
  const result = await db
    .update(flowRuns)
    .set({
      status: 'failed',
      errorCode: 'WORKFLOW_CREATE_FAILED',
      updatedAt: now,
    })
    .where(
      and(
        eq(flowRuns.id, input.id),
        eq(flowRuns.orgId, input.orgId),
        eq(flowRuns.status, 'queued'),
      ),
    )
    .run()
  if ((result.meta.changes ?? 0) !== 1) return false
  await insertFlowRunEvent(db, {
    orgId: input.orgId,
    runId: input.id,
    kind: 'status',
    statusFrom: 'queued',
    statusTo: 'failed',
    errorCode: 'WORKFLOW_CREATE_FAILED',
    now,
  })
  return true
}
