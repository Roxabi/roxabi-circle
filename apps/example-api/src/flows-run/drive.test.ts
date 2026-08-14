import { createRunSnapshot, createToolRegistry, loadPlanFromYaml } from '@kit/flows'
import { describe, expect, it } from 'vitest'
import { createMemoryEnv } from '../test/memory-env'
import { type DriveStep, driveFlowRun } from './drive'
import { INVOKE_ONLY_PLAN_YAML } from './fixtures'

type RunRow = {
  status: string
  error_code: string | null
  receipt_json: string | null
  workflow_instance_id: string | null
}

const immediateStep: DriveStep = async (_name, fn) => fn()

const registry = createToolRegistry('example-api-drive-v0', [
  { name: 'echo', description: 'Echo args (kit dogfood)', effect: 'read' },
])

const INSTANCE_ID = 'wfinst_drive_v1'

function seal(orgId: string) {
  const plan = loadPlanFromYaml(INVOKE_ONLY_PLAN_YAML)
  const result = createRunSnapshot({
    plan,
    grant: {
      orgId,
      allowedTools: ['echo'],
      registryVersion: registry.version,
      allowsInfer: false,
    },
    registry,
    actorId: 'actor_1',
  })
  if (!result.ok) {
    throw new Error(`fixture snapshot failed: ${result.issues.map((i) => i.code).join(',')}`)
  }
  return result
}

function makePorts() {
  let invokeCount = 0
  let inferCount = 0
  return {
    get invokeCount() {
      return invokeCount
    },
    get inferCount() {
      return inferCount
    },
    invoke: async () => {
      invokeCount += 1
      return { output: 'echo' }
    },
    infer: async () => {
      inferCount += 1
      return { text: 'n', tokens: 1 }
    },
  }
}

async function insertQueued(
  db: ReturnType<typeof createMemoryEnv>['DB'],
  opts: {
    runId: string
    orgId: string
    snapshotJson: string
    planDigest: string
    enabled?: number
    planJson?: string
  },
) {
  const now = Date.now()
  await db
    .prepare(
      `INSERT INTO flow_plans (id, org_id, plan_key, version, enabled, plan_json, plan_digest, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    )
    .bind(
      `plan_${opts.runId}`,
      opts.orgId,
      'echo-only',
      opts.enabled ?? 1,
      opts.planJson ?? '{}',
      opts.planDigest,
      now,
      now,
    )
    .run()
  await db
    .prepare(
      `INSERT INTO flow_runs (
        id, org_id, plan_id, plan_key, status, actor_id, snapshot_json, plan_digest, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)`,
    )
    .bind(
      opts.runId,
      opts.orgId,
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

async function loadRun(db: ReturnType<typeof createMemoryEnv>['DB'], runId: string, orgId: string) {
  return (await db
    .prepare(
      `SELECT status, error_code, receipt_json, workflow_instance_id FROM flow_runs WHERE id = ? AND org_id = ?`,
    )
    .bind(runId, orgId)
    .first()) as RunRow | null
}

function receiptTasks(receiptJson: string | null) {
  return (JSON.parse(receiptJson as string) as { tasks?: Record<string, { outcome?: string }> })
    .tasks
}

async function driveSealed(runId: string, extra?: { enabled?: number; planJson?: string }) {
  const env = createMemoryEnv()
  const snap = seal('org_a')
  await insertQueued(env.DB, {
    runId,
    orgId: 'org_a',
    snapshotJson: JSON.stringify(snap.runnerView),
    planDigest: snap.runnerView.planDigest,
    enabled: extra?.enabled,
    planJson: extra?.planJson,
  })
  const ports = makePorts()
  await driveFlowRun({
    step: immediateStep,
    db: env.DB as unknown as D1Database,
    invoke: ports.invoke,
    infer: ports.infer,
    payload: { runId, orgId: 'org_a' },
    instanceId: INSTANCE_ID,
  })
  return { snap, ports, row: await loadRun(env.DB, runId, 'org_a') }
}

describe('driveFlowRun success', () => {
  it('writes echo_hello outcome ok and status succeeded for invoke-only fixture', async () => {
    const { snap, ports, row } = await driveSealed('run_ok')
    expect('grantAudit' in snap.runnerView).toBe(false)
    expect(row).toBeTruthy()
    expect(row?.status).toBe('succeeded')
    expect(row?.workflow_instance_id).toBe(INSTANCE_ID)
    expect(receiptTasks(row?.receipt_json)?.echo_hello?.outcome).toBe('ok')
    expect(ports.invokeCount).toBe(1)
    expect(ports.inferCount).toBe(0)
  })

  it('ignores enabled=false on the plan row and still succeeds the snapshot', async () => {
    const { row, ports } = await driveSealed('run_disabled', { enabled: 0 })
    expect(row?.status).toBe('succeeded')
    expect(receiptTasks(row?.receipt_json)?.echo_hello?.outcome).toBe('ok')
    expect(ports.invokeCount).toBe(1)
  })

  it('ignores live plan_json edits and does not record a mutated task', async () => {
    const { row, ports } = await driveSealed('run_live_edit', {
      planJson: JSON.stringify({
        tasks: { mutated: { invoke: { tool: 'echo', args: { text: 'live' } } } },
      }),
    })
    const tasks = receiptTasks(row?.receipt_json)
    expect(row?.status).toBe('succeeded')
    expect(tasks?.echo_hello?.outcome).toBe('ok')
    expect(tasks).not.toHaveProperty('mutated')
    expect(ports.invokeCount).toBe(1)
  })
})
