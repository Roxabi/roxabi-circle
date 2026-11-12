import { describe, expect, it } from 'vitest'
import { createRunSnapshot, createToolRegistry, loadPlanFromYaml, mintCapabilityGrant } from '..'
import { runApproveStep } from './approve-step'
import { INVOKE_ONLY_PLAN_YAML } from './fixtures'
import { runInferStep } from './infer-step'
import { runInvokeStep } from './invoke-step'
import { loadRun, persistBundle } from './persist'
import type { DriveStep } from './step-io'
import { createMemoryDb } from './test/memory-db'

const ORG = 'org_a'
const RUN = 'run_lost'
const immediate: DriveStep = async (_name, fn) => fn()

const registry = createToolRegistry('example-api-drive-v0', [
  { name: 'echo', description: 'Echo args (kit dogfood)', grantClass: 'mintable' },
])

function sealInvoke() {
  const minted = mintCapabilityGrant({
    orgId: ORG,
    registry,
    facts: { moduleEffective: true, canRead: true, canWrite: false, allowedModels: [] },
  })
  if (!minted.ok) throw new Error(minted.message)
  const snap = createRunSnapshot({
    plan: loadPlanFromYaml(INVOKE_ONLY_PLAN_YAML),
    grant: minted.grant,
    registry,
    actorId: 'actor_1',
  })
  if (!snap.ok) throw new Error(snap.issues.map((issue) => issue.code).join(','))
  return snap
}

async function seed(db: D1Database, status: string, receiptJson: string) {
  const snap = sealInvoke()
  const now = Date.now()
  await db
    .prepare(
      `INSERT INTO flow_plans (id, org_id, plan_key, version, enabled, plan_json, plan_digest, created_at, updated_at)
       VALUES ('plan_lost', ?, 'echo-only', 1, 1, '{}', ?, ?, ?)`,
    )
    .bind(ORG, snap.runnerView.planDigest, now, now)
    .run()
  await db
    .prepare(
      `INSERT INTO flow_runs (
        id, org_id, plan_id, plan_key, status, actor_id, snapshot_json, plan_digest, receipt_json, created_at, updated_at
      ) VALUES (?, ?, 'plan_lost', 'echo-only', ?, 'actor_1', ?, ?, ?, ?, ?)`,
    )
    .bind(
      RUN,
      ORG,
      status,
      JSON.stringify(snap.runnerView),
      snap.runnerView.planDigest,
      receiptJson,
      now,
      now,
    )
    .run()
  return snap.runnerView
}

const started = JSON.stringify({
  receiptVersion: 1,
  tokensUsed: 0,
  tasks: { echo_hello: { taskId: 'echo_hello', outcome: 'started' } },
})

function io(db: D1Database) {
  return {
    persist: persistBundle,
    load: loadRun,
    db,
    ids: { runId: RUN, orgId: ORG },
    taskIds: ['echo_hello'],
  }
}

describe('receipt lost re-entry', () => {
  it('does not call invoke when the receipt is already started', async () => {
    const db = createMemoryDb()
    const view = await seed(db, 'running', started)
    let calls = 0
    await runInvokeStep({
      step: immediate,
      invoke: async () => {
        calls += 1
        return { output: 'again' }
      },
      view,
      taskId: 'echo_hello',
      tool: 'echo',
      io: io(db),
    })
    expect(calls).toBe(0)
    const row = await loadRun(db, RUN, ORG)
    const tasks = JSON.parse(row?.receipt_json ?? '{}').tasks
    expect(tasks.echo_hello).toMatchObject({ outcome: 'fail', errorCode: 'RECEIPT_LOST' })
  })

  it('writes started before the invoke port on first entry', async () => {
    const db = createMemoryDb()
    const view = await seed(
      db,
      'running',
      JSON.stringify({ receiptVersion: 1, tokensUsed: 0, tasks: {} }),
    )
    let sawStarted = false
    await runInvokeStep({
      step: immediate,
      invoke: async () => {
        const row = await loadRun(db, RUN, ORG)
        sawStarted = JSON.parse(row?.receipt_json ?? '{}').tasks.echo_hello?.outcome === 'started'
        return { output: 'once' }
      },
      view,
      taskId: 'echo_hello',
      tool: 'echo',
      io: io(db),
    })
    expect(sawStarted).toBe(true)
    const row = await loadRun(db, RUN, ORG)
    expect(JSON.parse(row?.receipt_json ?? '{}').tasks.echo_hello.outcome).toBe('ok')
  })

  it('does not call infer when the receipt is already started', async () => {
    const db = createMemoryDb()
    const view = await seed(db, 'running', started)
    let calls = 0
    await runInferStep({
      step: immediate,
      infer: async () => {
        calls += 1
        return { text: 'n', tokens: 1 }
      },
      view,
      taskId: 'echo_hello',
      body: { prompt: 'x' },
      io: io(db),
    })
    expect(calls).toBe(0)
    const tasks = JSON.parse((await loadRun(db, RUN, ORG))?.receipt_json ?? '{}').tasks
    expect(tasks.echo_hello).toMatchObject({ outcome: 'fail', errorCode: 'RECEIPT_LOST' })
  })

  it('scrubs started to RECEIPT_LOST without a port call when the run is already terminal', async () => {
    const db = createMemoryDb()
    const view = await seed(db, 'failed', started)
    let calls = 0
    await expect(
      runInvokeStep({
        step: immediate,
        invoke: async () => {
          calls += 1
          return { output: 'no' }
        },
        view,
        taskId: 'echo_hello',
        tool: 'echo',
        io: io(db),
      }),
    ).rejects.toMatchObject({ name: 'DriveNonRetryableError', message: 'RECEIPT_LOST' })
    expect(calls).toBe(0)
    const row = await loadRun(db, RUN, ORG)
    expect(row?.status).toBe('failed')
    const tasks = JSON.parse(row?.receipt_json ?? '{}').tasks
    expect(tasks.echo_hello).toMatchObject({ outcome: 'fail', errorCode: 'RECEIPT_LOST' })
  })

  it('does not call the approval wait when open re-enters on started', async () => {
    const db = createMemoryDb()
    const now = Date.now()
    const minted = mintCapabilityGrant({
      orgId: ORG,
      registry,
      facts: { moduleEffective: true, canRead: true, canWrite: true, allowedModels: [] },
    })
    if (!minted.ok) throw new Error(minted.message)
    const plan = loadPlanFromYaml(`flows: v0
plan:
  id: approve-lost
permits:
  tools: []
tasks:
  gate:
    approve:
      timeout_hours: 1
`)
    const snap = createRunSnapshot({ plan, grant: minted.grant, registry, actorId: 'actor_1' })
    if (!snap.ok) throw new Error(snap.issues.map((issue) => issue.code).join(','))
    await db
      .prepare(
        `INSERT INTO flow_plans (id, org_id, plan_key, version, enabled, plan_json, plan_digest, created_at, updated_at)
         VALUES ('plan_gate', ?, 'approve-lost', 1, 1, '{}', ?, ?, ?)`,
      )
      .bind(ORG, snap.runnerView.planDigest, now, now)
      .run()
    await db
      .prepare(
        `INSERT INTO flow_runs (
          id, org_id, plan_id, plan_key, status, actor_id, snapshot_json, plan_digest, receipt_json, created_at, updated_at
        ) VALUES ('run_gate', ?, 'plan_gate', 'approve-lost', 'running', 'actor_1', ?, ?, ?, ?, ?)`,
      )
      .bind(
        ORG,
        JSON.stringify(snap.runnerView),
        snap.runnerView.planDigest,
        JSON.stringify({
          receiptVersion: 1,
          tokensUsed: 0,
          tasks: { gate: { taskId: 'gate', outcome: 'started' } },
        }),
        now,
        now,
      )
      .run()
    let waits = 0
    await runApproveStep({
      step: immediate,
      awaitApproval: async () => {
        waits += 1
        return 'event'
      },
      taskId: 'gate',
      timeoutHours: 1,
      io: {
        persist: persistBundle,
        load: loadRun,
        db,
        ids: { runId: 'run_gate', orgId: ORG },
        taskIds: ['gate'],
      },
    })
    expect(waits).toBe(0)
    const tasks = JSON.parse((await loadRun(db, 'run_gate', ORG))?.receipt_json ?? '{}').tasks
    expect(tasks.gate).toMatchObject({ outcome: 'fail', errorCode: 'RECEIPT_LOST' })
  })
})
