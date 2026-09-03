/** D1 load / CAS claim / receipt persist for flow_runs. Never reads flow_plans. */

import { drizzle } from 'drizzle-orm/d1'
import { flowsDrizzleSchema } from '../drizzle-schema'
import {
  claimRun as claimRunRepo,
  getRun,
  persistRunBundle as persistRunBundleRepo,
} from '../repos'

export type FlowRunRow = {
  id: string
  org_id: string
  plan_id: string
  plan_key: string
  status: string
  actor_id: string
  snapshot_json: string
  plan_digest: string
  workflow_instance_id: string | null
  receipt_json: string | null
  error_code: string | null
  created_at: number
  updated_at: number
}

type RunRow = NonNullable<Awaited<ReturnType<typeof getRun>>>

function dbFromD1(db: D1Database) {
  return drizzle(db, { schema: flowsDrizzleSchema })
}

function toFlowRunRow(row: RunRow): FlowRunRow {
  return {
    id: row.id,
    org_id: row.orgId,
    plan_id: row.planId,
    plan_key: row.planKey,
    status: row.status,
    actor_id: row.actorId,
    snapshot_json: row.snapshotJson,
    plan_digest: row.planDigest,
    workflow_instance_id: row.workflowInstanceId ?? null,
    receipt_json: row.receiptJson ?? null,
    error_code: row.errorCode ?? null,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

/** Load by id + org_id. Missing → null. */
export async function loadRun(
  db: D1Database,
  runId: string,
  orgId: string,
): Promise<FlowRunRow | null> {
  const row = await getRun(dbFromD1(db), runId, orgId)
  return row ? toFlowRunRow(row) : null
}

/**
 * CAS queued → running, or no-op if this instance already owns the row.
 * Returns 1 when this instance holds the claim, 0 when lost.
 */
export async function claimRun(
  db: D1Database,
  input: { runId: string; orgId: string; instanceId: string; now?: number },
): Promise<number> {
  return claimRunRepo(dbFromD1(db), input)
}

/** Writes receipts + rollup. Returns meta.changes (1 = wrote). */
export async function persistBundle(
  db: D1Database,
  input: {
    runId: string
    orgId: string
    status: string
    receiptJson: string
    errorCode?: string | null
    now?: number
  },
): Promise<number> {
  return persistRunBundleRepo(dbFromD1(db), input)
}
