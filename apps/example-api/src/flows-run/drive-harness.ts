import { createRunSnapshot, createToolRegistry, loadPlanFromYaml } from '@kit/flows'
import type { createMemoryEnv } from '../test/memory-env'
import type { DriveStep } from './drive'
import { INVOKE_ONLY_PLAN_YAML } from './fixtures'

export const DRIVE_ORG = 'org_a'
export const immediateStep: DriveStep = async (_name, fn) => fn()

export const driveRegistry = createToolRegistry('example-api-drive-v0', [
  { name: 'echo', description: 'Echo args (kit dogfood)', effect: 'read' },
])

export function sealInvokeOnly(orgId: string) {
  const plan = loadPlanFromYaml(INVOKE_ONLY_PLAN_YAML)
  const result = createRunSnapshot({
    plan,
    grant: {
      orgId,
      allowedTools: ['echo'],
      registryVersion: driveRegistry.version,
      allowsInfer: false,
    },
    registry: driveRegistry,
    actorId: 'actor_1',
  })
  if (!result.ok) {
    throw new Error(`fixture snapshot failed: ${result.issues.map((i) => i.code).join(',')}`)
  }
  return result
}

export async function insertQueuedRun(
  db: ReturnType<typeof createMemoryEnv>['DB'],
  opts: { runId: string; snapshotJson: string; planDigest: string },
) {
  const now = Date.now()
  await db
    .prepare(
      `INSERT INTO flow_plans (id, org_id, plan_key, version, enabled, plan_json, plan_digest, created_at, updated_at)
       VALUES (?, ?, ?, 1, 1, '{}', ?, ?, ?)`,
    )
    .bind(`plan_${opts.runId}`, DRIVE_ORG, 'echo-only', opts.planDigest, now, now)
    .run()
  await db
    .prepare(
      `INSERT INTO flow_runs (
        id, org_id, plan_id, plan_key, status, actor_id, snapshot_json, plan_digest, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)`,
    )
    .bind(
      opts.runId,
      DRIVE_ORG,
      `plan_${opts.runId}`,
      'echo-only',
      'actor_1',
      opts.snapshotJson,
      opts.planDigest,
      now,
      now,
    )
    .run()
}

export async function loadRunRow(db: ReturnType<typeof createMemoryEnv>['DB'], runId: string) {
  return (await db
    .prepare(`SELECT status, error_code, receipt_json FROM flow_runs WHERE id = ? AND org_id = ?`)
    .bind(runId, DRIVE_ORG)
    .first()) as {
    status: string
    error_code: string | null
    receipt_json: string | null
  } | null
}
