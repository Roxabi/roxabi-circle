import { createRunSnapshot, createToolRegistry, loadPlanFromYaml, mintCapabilityGrant } from '../..'
import { DriveNonRetryableError, type DriveStep } from '../drive'
import { createMemoryDb } from './memory-db'

export const ORG = 'org_notice'
export const RUN = 'run_notice'
export const HOUR = 3_600_000
export const T0 = Date.UTC(2026, 8, 28, 8)

const registry = createToolRegistry('example-api-drive-v0', [
  { name: 'echo', description: 'Echo args (kit dogfood)', grantClass: 'mintable' },
])

const PLAN = `flows: v0
plan:
  id: approval-notice
permits:
  tools:
    - echo
tasks:
  gate:
    approve:
      timeout_hours: 1
  echo_hello:
    after:
      - gate
    invoke:
      tool: echo
`

export async function seed(yaml = PLAN, status: 'queued' | 'running' = 'queued') {
  const db = createMemoryDb()
  const grant = mintCapabilityGrant({
    orgId: ORG,
    registry,
    facts: { moduleEffective: true, canRead: true, canWrite: true, allowedModels: [] },
  })
  if (!grant.ok) throw new Error(grant.message)
  const sealed = createRunSnapshot({
    plan: loadPlanFromYaml(yaml),
    grant: grant.grant,
    registry,
    actorId: 'actor_1',
  })
  if (!sealed.ok) throw new Error(sealed.issues.map((issue) => issue.code).join(','))
  const now = Date.now()
  await db
    .prepare(
      `INSERT INTO flow_plans (id, org_id, plan_key, version, enabled, plan_json, plan_digest, created_at, updated_at)
     VALUES ('plan_notice', ?, 'notice', 1, 1, '{}', ?, ?, ?)`,
    )
    .bind(ORG, sealed.runnerView.planDigest, now, now)
    .run()
  await db
    .prepare(
      `INSERT INTO flow_runs (id, org_id, plan_id, plan_key, status, actor_id, snapshot_json, plan_digest, created_at, updated_at)
     VALUES (?, ?, 'plan_notice', 'notice', ?, 'actor_1', ?, ?, ?, ?)`,
    )
    .bind(
      RUN,
      ORG,
      status,
      JSON.stringify(sealed.runnerView),
      sealed.runnerView.planDigest,
      now,
      now,
    )
    .run()
  return db
}

export async function decide(db: D1Database, taskId: string, decision: 'approved' | 'rejected') {
  await db
    .prepare(
      `INSERT INTO flow_run_approvals (id, org_id, run_id, task_id, decision, decided_by, decided_at)
     VALUES (?, ?, ?, ?, ?, 'user_staff', ?)`,
    )
    .bind(`approval_${taskId}`, ORG, RUN, taskId, decision, Date.now())
    .run()
}

export async function state(db: D1Database) {
  const row = await db
    .prepare('SELECT status, error_code, receipt_json FROM flow_runs WHERE org_id = ? AND id = ?')
    .bind(ORG, RUN)
    .first<{ status: string; error_code: string | null; receipt_json: string | null }>()
  if (!row) throw new Error('missing run')
  const receipt: { tasks?: Record<string, { outcome: string; errorCode?: string }> } = JSON.parse(
    row.receipt_json ?? '{}',
  )
  return { ...row, tasks: receipt.tasks ?? {} }
}

export async function decision(db: D1Database, taskId = 'gate') {
  return db
    .prepare(
      'SELECT decision FROM flow_run_approvals WHERE org_id = ? AND run_id = ? AND task_id = ?',
    )
    .bind(ORG, RUN, taskId)
    .first<{ decision: string }>()
}

/** Executes callbacks like the Workflow owner, including retries and optional replay. */
export function ownerStep(
  options: {
    cache?: Map<string, unknown>
    names?: string[]
    errors?: unknown[]
    before?: (name: string) => Promise<void>
  } = {},
): DriveStep {
  return async (name, fn, config) => {
    options.names?.push(name)
    if (options.cache?.has(name)) return options.cache.get(name) as never
    await options.before?.(name)
    const limit = config?.retries?.limit ?? 0
    for (let attempt = 0; ; attempt++) {
      try {
        const value = await fn()
        options.cache?.set(name, value)
        return value
      } catch (error) {
        options.errors?.push(error)
        if (error instanceof DriveNonRetryableError || attempt >= limit) throw error
      }
    }
  }
}
