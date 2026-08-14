/** D1 load / CAS claim / receipt persist for flow_runs. Never reads flow_plans. */

import { FLOW_RUN_STATUSES } from '@kit/flows'

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

const STATUS_SET = new Set<string>(FLOW_RUN_STATUSES)

/** Load by id + org_id. Missing → null. */
export async function loadRun(
  db: D1Database,
  runId: string,
  orgId: string,
): Promise<FlowRunRow | null> {
  const row = await db
    .prepare(`SELECT * FROM flow_runs WHERE id = ? AND org_id = ?`)
    .bind(runId, orgId)
    .first<FlowRunRow>()
  return row ?? null
}

/**
 * CAS queued → running, or no-op if this instance already owns the row.
 * Returns 1 when this instance holds the claim, 0 when lost.
 */
export async function claimRun(
  db: D1Database,
  input: { runId: string; orgId: string; instanceId: string; now?: number },
): Promise<number> {
  if (!input.instanceId || input.instanceId.length > 128) return 0
  const now = input.now ?? Date.now()
  const result = await db
    .prepare(
      `UPDATE flow_runs SET status='running', workflow_instance_id=?, updated_at=?
       WHERE id=? AND org_id=? AND status='queued'`,
    )
    .bind(input.instanceId, now, input.runId, input.orgId)
    .run()
  if (result.meta.changes === 1) return 1
  const row = await loadRun(db, input.runId, input.orgId)
  if (row?.status === 'running' && row.workflow_instance_id === input.instanceId) return 1
  return 0
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
  if (!STATUS_SET.has(input.status)) return 0
  const now = input.now ?? Date.now()
  const result = await db
    .prepare(
      `UPDATE flow_runs SET receipt_json=?, status=?, error_code=?, updated_at=?
       WHERE id=? AND org_id=? AND status IN ('queued','running')`,
    )
    .bind(input.receiptJson, input.status, input.errorCode ?? null, now, input.runId, input.orgId)
    .run()
  return result.meta.changes
}
