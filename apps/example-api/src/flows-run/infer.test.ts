import { createRunSnapshot, createToolRegistry, loadPlanFromYaml } from '@kit/flows'
import { describe, expect, it } from 'vitest'
import { createMemoryEnv } from '../test/memory-env'
import { type DriveStep, driveFlowRun, type InferPort, type InvokePort } from './drive'

type RunRow = {
  status: string
  error_code: string | null
  receipt_json: string | null
  workflow_instance_id: string | null
}

type ReceiptTask = { outcome?: string; errorCode?: string }

/** Legal two-infer: static 80 ≤ plan.max 100 → hardMaxTokens = 80. Not DEMO_ECHO. */
const TWO_INFER_PLAN_YAML = `flows: v0
plan:
  id: two-infer
  max_tokens: 100
permits:
  tools:
    - echo
tasks:
  infer_a:
    infer:
      prompt: "one"
      max_tokens: 40
  infer_b:
    after:
      - infer_a
    infer:
      prompt: "two"
      max_tokens: 40
`

const immediateStep: DriveStep = async (_name, fn) => fn()

const registry = createToolRegistry('example-api-drive-v0', [
  { name: 'echo', description: 'Echo args (kit dogfood)', effect: 'read' },
])

const INSTANCE_ID = 'wfinst_infer_v2'
const ORG = 'org_a'

function seal(orgId: string) {
  const plan = loadPlanFromYaml(TWO_INFER_PLAN_YAML)
  const result = createRunSnapshot({
    plan,
    grant: {
      orgId,
      allowedTools: ['echo'],
      registryVersion: registry.version,
      allowsInfer: true,
    },
    registry,
    actorId: 'actor_1',
  })
  if (!result.ok) {
    throw new Error(`fixture snapshot failed: ${result.issues.map((i) => i.code).join(',')}`)
  }
  return result
}

function makeInferPort(firstTokens: number): {
  inferCount: number
  invoke: InvokePort
  infer: InferPort
} {
  let inferCount = 0
  return {
    get inferCount() {
      return inferCount
    },
    invoke: async () => ({ output: 'echo' }),
    infer: async () => {
      inferCount += 1
      if (inferCount === 1) return { text: 'x', tokens: firstTokens }
      return { text: 'y', tokens: 1 }
    },
  }
}

async function insertQueued(
  db: ReturnType<typeof createMemoryEnv>['DB'],
  opts: { runId: string; orgId: string; snapshotJson: string; planDigest: string },
) {
  const now = Date.now()
  await db
    .prepare(
      `INSERT INTO flow_plans (id, org_id, plan_key, version, enabled, plan_json, plan_digest, created_at, updated_at)
       VALUES (?, ?, ?, 1, 1, ?, ?, ?, ?)`,
    )
    .bind(`plan_${opts.runId}`, opts.orgId, 'two-infer', '{}', opts.planDigest, now, now)
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
      'two-infer',
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

function driveArgs(
  db: ReturnType<typeof createMemoryEnv>['DB'],
  runId: string,
  ports: { invoke: InvokePort; infer?: InferPort },
) {
  return {
    step: immediateStep,
    db: db as unknown as D1Database,
    invoke: ports.invoke,
    infer: ports.infer,
    payload: { runId, orgId: ORG },
    instanceId: INSTANCE_ID,
  }
}

function receiptOf(receiptJson: string | null) {
  return JSON.parse(receiptJson as string) as {
    tokensUsed: number
    tasks: Record<string, ReceiptTask>
  }
}

async function driveSealed(runId: string, ports: { invoke: InvokePort; infer?: InferPort }) {
  const env = createMemoryEnv()
  const snap = seal(ORG)
  await insertQueued(env.DB, {
    runId,
    orgId: ORG,
    snapshotJson: JSON.stringify(snap.runnerView),
    planDigest: snap.runnerView.planDigest,
  })
  await driveFlowRun(driveArgs(env.DB, runId, ports)).catch(() => {})
  return { snap, row: await loadRun(env.DB, runId, ORG) }
}

describe('driveFlowRun infer meter', () => {
  it('fails infer_b with TOKEN_CEILING after first actual overrun and does not call InferPort again', async () => {
    const ports = makeInferPort(50)
    const { snap, row } = await driveSealed('run_token_ceiling', ports)
    expect(snap.runnerView.ceilings.hardMaxTokens).toBe(80)
    expect(snap.runnerView.ceilings.staticTokenBudget).toBe(80)
    expect(row).toBeTruthy()
    expect(row?.status).toBe('failed')
    const receipt = receiptOf(row?.receipt_json ?? null)
    expect(receipt.tasks.infer_a?.outcome).toBe('ok')
    expect(receipt.tasks.infer_b?.outcome).toBe('fail')
    expect(receipt.tasks.infer_b?.errorCode).toBe('TOKEN_CEILING')
    expect(receipt.tokensUsed).toBe(50)
    expect(ports.inferCount).toBe(1)
  })

  it('fails first infer with INFER_FAILED when InferPort is missing', async () => {
    const { row } = await driveSealed('run_infer_missing', {
      invoke: async () => ({ output: 'echo' }),
    })
    expect(row).toBeTruthy()
    expect(row?.status).toBe('failed')
    const receipt = receiptOf(row?.receipt_json ?? null)
    expect(receipt.tasks.infer_a?.outcome).toBe('fail')
    expect(receipt.tasks.infer_a?.errorCode).toBe('INFER_FAILED')
  })

  it('fails infer_a with TOKEN_CEILING when actual tokens exceed hardMaxTokens and does not keep overflow', async () => {
    const ports = makeInferPort(90)
    const { row } = await driveSealed('run_actual_overflow', ports)
    expect(row).toBeTruthy()
    expect(row?.status).toBe('failed')
    const receipt = receiptOf(row?.receipt_json ?? null)
    expect(receipt.tasks.infer_a?.outcome).toBe('fail')
    expect(receipt.tasks.infer_a?.errorCode).toBe('TOKEN_CEILING')
    expect(receipt.tasks.infer_b?.outcome).toBe('skip')
    expect(receipt.tokensUsed).toBe(0)
    expect(ports.inferCount).toBe(1)
  })
})
