import { describe, expect, it } from 'vitest'
import { createRunSnapshot, createToolRegistry, loadPlanFromYaml } from '..'
import { DriveNonRetryableError, type DriveStep, driveFlowRun } from './drive'
import { INVOKE_ONLY_PLAN_YAML } from './fixtures'
import { claimRun } from './persist'
import { createMemoryDb } from './test/memory-db'

const DRIVE_ORG = 'org_a'
const immediateStep: DriveStep = async (_name, fn) => fn()

const driveRegistry = createToolRegistry('example-api-drive-v0', [
  { name: 'echo', description: 'Echo args (kit dogfood)', effect: 'read' },
])

function sealInvokeOnly(orgId: string) {
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

async function insertQueuedRun(
  db: ReturnType<typeof createMemoryDb>,
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

async function loadRunRow(db: ReturnType<typeof createMemoryDb>, runId: string) {
  return (await db
    .prepare(`SELECT status, error_code, receipt_json FROM flow_runs WHERE id = ? AND org_id = ?`)
    .bind(runId, DRIVE_ORG)
    .first()) as {
    status: string
    error_code: string | null
    receipt_json: string | null
  } | null
}

const INSTANCE_ID = 'wfinst_drive_fail'

describe('driveFlowRun fail-closed', () => {
  it('sets status=failed and RUNNER_VIEW_INVALID when snapshot has grantAudit extra key', async () => {
    const db = createMemoryDb()
    const snap = sealInvokeOnly(DRIVE_ORG)
    const runId = 'run_tamper'
    await insertQueuedRun(db, {
      runId,
      snapshotJson: JSON.stringify({
        ...snap.runnerView,
        grantAudit: { tampered: true },
      }),
      planDigest: snap.runnerView.planDigest,
    })
    let invokeCount = 0
    await expect(
      driveFlowRun({
        step: immediateStep,
        db,
        invoke: async () => {
          invokeCount += 1
          return { output: 'echo' }
        },
        payload: { runId, orgId: DRIVE_ORG },
        instanceId: INSTANCE_ID,
      }),
    ).rejects.toBeInstanceOf(DriveNonRetryableError)
    const row = await loadRunRow(db, runId)
    expect(row?.status).toBe('failed')
    expect(row?.error_code).toBe('RUNNER_VIEW_INVALID')
    expect(invokeCount).toBe(0)
    expect(JSON.parse(row?.receipt_json as string)).toEqual({
      receiptVersion: 1,
      tokensUsed: 0,
      tasks: {},
    })
  })

  it('sets status=failed and ORG_MISMATCH when view.orgId differs from row and params', async () => {
    const db = createMemoryDb()
    const snap = sealInvokeOnly(DRIVE_ORG)
    const wire = JSON.parse(JSON.stringify(snap.runnerView)) as { orgId: string }
    wire.orgId = 'org_b'
    const runId = 'run_org'
    await insertQueuedRun(db, {
      runId,
      snapshotJson: JSON.stringify(wire),
      planDigest: snap.runnerView.planDigest,
    })
    let invokeCount = 0
    await expect(
      driveFlowRun({
        step: immediateStep,
        db,
        invoke: async () => {
          invokeCount += 1
          return { output: 'echo' }
        },
        payload: { runId, orgId: DRIVE_ORG },
        instanceId: INSTANCE_ID,
      }),
    ).rejects.toBeInstanceOf(DriveNonRetryableError)
    const row = await loadRunRow(db, runId)
    expect(row?.status).toBe('failed')
    expect(row?.error_code).toBe('ORG_MISMATCH')
    expect(invokeCount).toBe(0)
  })

  it('does not call invoke or infer when interpret returns empty readyTaskIds', async () => {
    const db = createMemoryDb()
    const snap = sealInvokeOnly(DRIVE_ORG)
    const runId = 'run_dual'
    await insertQueuedRun(db, {
      runId,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    let invokeCount = 0
    let inferCount = 0
    let interpretCalls = 0
    await expect(
      driveFlowRun({
        step: immediateStep,
        db,
        invoke: async () => {
          invokeCount += 1
          return { output: 'echo' }
        },
        infer: async () => {
          inferCount += 1
          return { text: 'n', tokens: 1 }
        },
        interpret: (_view, receipts) => {
          interpretCalls += 1
          return { receipts, readyTaskIds: [], rollup: 'failed', stuck: 'DAG_STUCK' }
        },
        payload: { runId, orgId: DRIVE_ORG },
        instanceId: INSTANCE_ID,
      }),
    ).rejects.toMatchObject({ name: 'DriveNonRetryableError', message: 'DAG_STUCK' })
    expect(interpretCalls).toBeGreaterThan(0)
    expect(invokeCount).toBe(0)
    expect(inferCount).toBe(0)
  })

  it('does not dispatch when claim is already held by another instance', async () => {
    const db = createMemoryDb()
    const snap = sealInvokeOnly(DRIVE_ORG)
    const runId = 'run_claim'
    await insertQueuedRun(db, {
      runId,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    expect(
      await claimRun(db, {
        runId,
        orgId: DRIVE_ORG,
        instanceId: 'wfinst_other',
      }),
    ).toBe(1)
    let invokeCount = 0
    await expect(
      driveFlowRun({
        step: immediateStep,
        db,
        invoke: async () => {
          invokeCount += 1
          return { output: 'echo' }
        },
        payload: { runId, orgId: DRIVE_ORG },
        instanceId: INSTANCE_ID,
      }),
    ).rejects.toMatchObject({ name: 'DriveNonRetryableError', message: 'claim lost' })
    expect(invokeCount).toBe(0)
    expect((await loadRunRow(db, runId))?.status).toBe('running')
  })

  it('rejects extra payload keys without writing D1', async () => {
    const db = createMemoryDb()
    const snap = sealInvokeOnly(DRIVE_ORG)
    const runId = 'run_extra'
    await insertQueuedRun(db, {
      runId,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    let invokeCount = 0
    await expect(
      driveFlowRun({
        step: immediateStep,
        db,
        invoke: async () => {
          invokeCount += 1
          return { output: 'echo' }
        },
        payload: { runId, orgId: DRIVE_ORG, snapshot: snap.runnerView },
        instanceId: INSTANCE_ID,
      }),
    ).rejects.toMatchObject({ name: 'DriveNonRetryableError', message: 'invalid payload' })
    expect(invokeCount).toBe(0)
    expect((await loadRunRow(db, runId))?.status).toBe('queued')
  })

  it('catches invoke throw as INVOKE_FAILED without leaking the raw error', async () => {
    const db = createMemoryDb()
    const snap = sealInvokeOnly(DRIVE_ORG)
    const runId = 'run_invoke_boom'
    await insertQueuedRun(db, {
      runId,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    await expect(
      driveFlowRun({
        step: immediateStep,
        db,
        invoke: async () => {
          throw new Error('boom')
        },
        payload: { runId, orgId: DRIVE_ORG },
        instanceId: INSTANCE_ID,
      }),
    ).rejects.toBeInstanceOf(DriveNonRetryableError)
    const row = await loadRunRow(db, runId)
    const tasks = JSON.parse(row?.receipt_json as string) as {
      tasks?: { echo_hello?: { outcome?: string; errorCode?: string } }
    }
    expect(row?.status).toBe('failed')
    expect(tasks.tasks?.echo_hello?.outcome).toBe('fail')
    expect(tasks.tasks?.echo_hello?.errorCode).toBe('INVOKE_FAILED')
  })

  it('fails UNKNOWN_TOOL when hasTool rejects a sealed execution tool', async () => {
    const db = createMemoryDb()
    const snap = sealInvokeOnly(DRIVE_ORG)
    const runId = 'run_unknown_tool'
    await insertQueuedRun(db, {
      runId,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    await expect(
      driveFlowRun({
        step: immediateStep,
        db,
        invoke: async () => ({ output: 'echo' }),
        hasTool: () => false,
        payload: { runId, orgId: DRIVE_ORG },
        instanceId: INSTANCE_ID,
      }),
    ).rejects.toBeInstanceOf(DriveNonRetryableError)
    const tasks = JSON.parse((await loadRunRow(db, runId))?.receipt_json as string) as {
      tasks?: { echo_hello?: { errorCode?: string } }
    }
    expect(tasks.tasks?.echo_hello?.errorCode).toBe('UNKNOWN_TOOL')
  })
})
