/** Seed one sealed flow run in the memory DB. Test-only; not exported from the package. */

import { createRunSnapshot, createToolRegistry, loadPlanFromYaml, mintCapabilityGrant } from '../..'
import type { RunnerView } from '../../snapshot'
import { loadRun, persistBundle } from '../persist'
import type { StepReceiptCtx } from '../step-io'

export const SEED_ORG = 'org_a'

const registry = createToolRegistry('example-api-drive-v0', [
  { name: 'echo', description: 'Echo args (kit dogfood)', grantClass: 'mintable' },
])

export async function seedRun(
  db: D1Database,
  opts: {
    runId: string
    planYaml: string
    status: string
    tasks?: Record<string, Record<string, unknown>>
    tokensUsed?: number
    canWrite?: boolean
    orgId?: string
  },
): Promise<RunnerView> {
  const orgId = opts.orgId ?? SEED_ORG
  const minted = mintCapabilityGrant({
    orgId,
    registry,
    facts: {
      moduleEffective: true,
      canRead: true,
      canWrite: opts.canWrite ?? false,
      allowedModels: ['kit-infer'],
    },
  })
  if (!minted.ok) throw new Error(minted.message)
  const snap = createRunSnapshot({
    plan: loadPlanFromYaml(opts.planYaml),
    grant: minted.grant,
    registry,
    actorId: 'actor_1',
  })
  if (!snap.ok) throw new Error(snap.issues.map((issue) => issue.code).join(','))
  const now = Date.now()
  const planId = `plan_${opts.runId}`
  await db
    .prepare(
      `INSERT INTO flow_plans (id, org_id, plan_key, version, enabled, plan_json, plan_digest, created_at, updated_at)
       VALUES (?, ?, ?, 1, 1, '{}', ?, ?, ?)`,
    )
    .bind(planId, orgId, planId, snap.runnerView.planDigest, now, now)
    .run()
  const tasks = Object.fromEntries(
    Object.entries(opts.tasks ?? {}).map(([id, rec]) => [id, { taskId: id, ...rec }]),
  )
  await db
    .prepare(
      `INSERT INTO flow_runs (
        id, org_id, plan_id, plan_key, status, actor_id, snapshot_json, plan_digest, receipt_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'actor_1', ?, ?, ?, ?, ?)`,
    )
    .bind(
      opts.runId,
      orgId,
      planId,
      planId,
      opts.status,
      JSON.stringify(snap.runnerView),
      snap.runnerView.planDigest,
      JSON.stringify({ receiptVersion: 1, tokensUsed: opts.tokensUsed ?? 0, tasks }),
      now,
      now,
    )
    .run()
  return snap.runnerView
}

export function stepIo(
  db: D1Database,
  runId: string,
  taskIds: readonly string[],
  orgId = SEED_ORG,
): StepReceiptCtx {
  return { persist: persistBundle, load: loadRun, db, ids: { runId, orgId }, taskIds }
}

export async function taskReceipts(db: D1Database, runId: string, orgId = SEED_ORG) {
  const row = await loadRun(db, runId, orgId)
  return {
    status: row?.status,
    errorCode: row?.error_code,
    tokensUsed: JSON.parse(row?.receipt_json ?? '{}').tokensUsed as number | undefined,
    tasks: (JSON.parse(row?.receipt_json ?? '{}').tasks ?? {}) as Record<
      string,
      { outcome?: string; errorCode?: string; output?: string }
    >,
  }
}
