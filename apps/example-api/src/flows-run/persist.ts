/** D1 load / CAS claim / receipt persist for flow_runs. Never reads flow_plans. */

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

/** CAS queued → running. Returns meta.changes (0 = lost race / already claimed). */
export async function claimRun(
  db: D1Database,
  input: { runId: string; orgId: string; instanceId: string; now?: number },
): Promise<number> {
  const now = input.now ?? Date.now()
  const result = await db
    .prepare(
      `UPDATE flow_runs SET status='running', workflow_instance_id=?, updated_at=?
       WHERE id=? AND org_id=? AND status='queued'`,
    )
    .bind(input.instanceId, now, input.runId, input.orgId)
    .run()
  return result.meta.changes
}

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
): Promise<void> {
  const now = input.now ?? Date.now()
  await db
    .prepare(
      `UPDATE flow_runs SET receipt_json=?, status=?, error_code=?, updated_at=?
       WHERE id=? AND org_id=?`,
    )
    .bind(input.receiptJson, input.status, input.errorCode ?? null, now, input.runId, input.orgId)
    .run()
}
