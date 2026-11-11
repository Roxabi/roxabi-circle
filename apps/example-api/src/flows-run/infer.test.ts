import {
  createRunSnapshot,
  createToolRegistry,
  DEMO_ECHO_PLAN_YAML,
  loadPlanFromYaml,
  mintCapabilityGrant,
  registryHas,
} from '@kit/flows'
import {
  DriveNonRetryableError,
  type DriveStep,
  driveFlowRun,
  type InferPort,
  type InvokePort,
} from '@kit/flows/run'
import { describe, expect, it } from 'vitest'
import { dogfoodToolRegistry } from '../lib/flows-dogfood'
import { createMemoryEnv } from '../test/memory-env'
import { inferMock, invokeEcho } from './ports'

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
  model: kit-infer
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
  { name: 'echo', description: 'Echo args (kit dogfood)', grantClass: 'mintable' },
])

const INSTANCE_ID = 'wfinst_infer_v2'
const ORG = 'org_a'

// createRunSnapshot seals only a kit-minted grant, so the fixture mints instead of asserting one.
function mintFixtureGrant(orgId: string) {
  const minted = mintCapabilityGrant({
    orgId,
    registry,
    facts: { moduleEffective: true, canRead: true, canWrite: true, allowedModels: ['kit-infer'] },
  })
  if (!minted.ok) throw new Error(`fixture grant must mint: ${minted.message}`)
  return minted.grant
}

function seal(orgId: string) {
  const plan = loadPlanFromYaml(TWO_INFER_PLAN_YAML)
  const result = createRunSnapshot({
    plan,
    grant: mintFixtureGrant(orgId),
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
  await expect(driveFlowRun(driveArgs(env.DB, runId, ports))).rejects.toBeInstanceOf(
    DriveNonRetryableError,
  )
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
    const env = createMemoryEnv()
    const snap = seal(ORG)
    const runId = 'run_infer_missing'
    await insertQueued(env.DB, {
      runId,
      orgId: ORG,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    const stepNames: string[] = []
    const step: DriveStep = async (name, fn) => {
      stepNames.push(name)
      return fn()
    }
    await expect(
      driveFlowRun({
        step,
        db: env.DB as unknown as D1Database,
        invoke: async () => ({ output: 'echo' }),
        payload: { runId, orgId: ORG },
        instanceId: INSTANCE_ID,
      }),
    ).rejects.toBeInstanceOf(DriveNonRetryableError)
    const row = await loadRun(env.DB, runId, ORG)
    expect(row?.status).toBe('failed')
    const receipt = receiptOf(row?.receipt_json ?? null)
    expect(receipt.tasks.infer_a?.outcome).toBe('fail')
    expect(receipt.tasks.infer_a?.errorCode).toBe('INFER_FAILED')
    expect(stepNames.some((name) => name === 'infer:infer_a')).toBe(true)
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

describe('driveFlowRun dogfood DEMO_ECHO with InferPort test-double', () => {
  it('succeeds echo then infer when InferPort is bound', async () => {
    const env = createMemoryEnv()
    const plan = loadPlanFromYaml(DEMO_ECHO_PLAN_YAML)
    const snap = createRunSnapshot({
      plan,
      grant: (() => {
        const minted = mintCapabilityGrant({
          orgId: ORG,
          registry: dogfoodToolRegistry,
          facts: {
            moduleEffective: true,
            canRead: true,
            canWrite: true,
            allowedModels: ['kit-infer'],
          },
        })
        if (!minted.ok) throw new Error(`fixture grant must mint: ${minted.message}`)
        return minted.grant
      })(),
      registry: dogfoodToolRegistry,
      actorId: 'actor_1',
    })
    if (!snap.ok) throw new Error('snapshot failed')
    const runId = 'run_demo_echo_infer_mock'
    await insertQueued(env.DB, {
      runId,
      orgId: ORG,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    await driveFlowRun({
      step: immediateStep,
      db: env.DB as unknown as D1Database,
      invoke: invokeEcho,
      infer: inferMock,
      hasTool: (name) => registryHas(dogfoodToolRegistry, name),
      payload: { runId, orgId: ORG },
      instanceId: INSTANCE_ID,
    })
    const row = await loadRun(env.DB, runId, ORG)
    expect(row?.status).toBe('succeeded')
    const receipt = receiptOf(row?.receipt_json ?? null)
    expect(receipt.tasks.echo_hello?.outcome).toBe('ok')
    expect(receipt.tasks.summarize?.outcome).toBe('ok')
    expect(receipt.tokensUsed).toBe(1)
  })

  it('forwards inherited plan.model to InferPort when the task omits model', async () => {
    const env = createMemoryEnv()
    const minted = mintCapabilityGrant({
      orgId: ORG,
      registry: dogfoodToolRegistry,
      facts: {
        moduleEffective: true,
        canRead: true,
        canWrite: true,
        allowedModels: ['kit-infer'],
      },
    })
    if (!minted.ok) throw new Error(`fixture grant must mint: ${minted.message}`)
    const snap = createRunSnapshot({
      plan: loadPlanFromYaml(DEMO_ECHO_PLAN_YAML),
      grant: minted.grant,
      registry: dogfoodToolRegistry,
      actorId: 'actor_1',
    })
    if (!snap.ok) throw new Error('snapshot failed')
    const seen: Array<string | undefined> = []
    const runId = 'run_inherited_model'
    await insertQueued(env.DB, {
      runId,
      orgId: ORG,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    await driveFlowRun({
      step: immediateStep,
      db: env.DB as unknown as D1Database,
      invoke: invokeEcho,
      infer: async (task) => {
        seen.push(task.model)
        return { text: 'ok', tokens: 1 }
      },
      hasTool: (name) => registryHas(dogfoodToolRegistry, name),
      payload: { runId, orgId: ORG },
      instanceId: INSTANCE_ID,
    })
    expect(seen).toEqual(['kit-infer'])
  })
})
