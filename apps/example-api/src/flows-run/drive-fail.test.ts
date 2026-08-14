import { describe, expect, it } from 'vitest'
import { createMemoryEnv } from '../test/memory-env'
import { DriveNonRetryableError, driveFlowRun } from './drive'
import {
  DRIVE_ORG,
  immediateStep,
  insertQueuedRun,
  loadRunRow,
  sealInvokeOnly,
} from './drive-harness'
import { claimRun } from './persist'

const INSTANCE_ID = 'wfinst_drive_fail'

describe('driveFlowRun fail-closed', () => {
  it('sets status=failed and RUNNER_VIEW_INVALID when snapshot has grantAudit extra key', async () => {
    const env = createMemoryEnv()
    const snap = sealInvokeOnly(DRIVE_ORG)
    const runId = 'run_tamper'
    await insertQueuedRun(env.DB, {
      runId,
      snapshotJson: JSON.stringify({
        ...JSON.parse(JSON.stringify(snap.runnerView)),
        grantAudit: snap.grantAudit,
      }),
      planDigest: snap.runnerView.planDigest,
    })
    let invokeCount = 0
    await expect(
      driveFlowRun({
        step: immediateStep,
        db: env.DB as unknown as D1Database,
        invoke: async () => {
          invokeCount += 1
          return { output: 'echo' }
        },
        payload: { runId, orgId: DRIVE_ORG },
        instanceId: INSTANCE_ID,
      }),
    ).rejects.toBeInstanceOf(DriveNonRetryableError)
    const row = await loadRunRow(env.DB, runId)
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
    const env = createMemoryEnv()
    const snap = sealInvokeOnly(DRIVE_ORG)
    const wire = JSON.parse(JSON.stringify(snap.runnerView)) as { orgId: string }
    wire.orgId = 'org_b'
    const runId = 'run_org'
    await insertQueuedRun(env.DB, {
      runId,
      snapshotJson: JSON.stringify(wire),
      planDigest: snap.runnerView.planDigest,
    })
    let invokeCount = 0
    await expect(
      driveFlowRun({
        step: immediateStep,
        db: env.DB as unknown as D1Database,
        invoke: async () => {
          invokeCount += 1
          return { output: 'echo' }
        },
        payload: { runId, orgId: DRIVE_ORG },
        instanceId: INSTANCE_ID,
      }),
    ).rejects.toBeInstanceOf(DriveNonRetryableError)
    const row = await loadRunRow(env.DB, runId)
    expect(row?.status).toBe('failed')
    expect(row?.error_code).toBe('ORG_MISMATCH')
    expect(invokeCount).toBe(0)
  })

  it('does not call invoke or infer when interpret returns empty readyTaskIds', async () => {
    const env = createMemoryEnv()
    const snap = sealInvokeOnly(DRIVE_ORG)
    const runId = 'run_dual'
    await insertQueuedRun(env.DB, {
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
        db: env.DB as unknown as D1Database,
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
    const env = createMemoryEnv()
    const snap = sealInvokeOnly(DRIVE_ORG)
    const runId = 'run_claim'
    await insertQueuedRun(env.DB, {
      runId,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    expect(
      await claimRun(env.DB as unknown as D1Database, {
        runId,
        orgId: DRIVE_ORG,
        instanceId: 'wfinst_other',
      }),
    ).toBe(1)
    let invokeCount = 0
    await expect(
      driveFlowRun({
        step: immediateStep,
        db: env.DB as unknown as D1Database,
        invoke: async () => {
          invokeCount += 1
          return { output: 'echo' }
        },
        payload: { runId, orgId: DRIVE_ORG },
        instanceId: INSTANCE_ID,
      }),
    ).rejects.toMatchObject({ name: 'DriveNonRetryableError', message: 'claim lost' })
    expect(invokeCount).toBe(0)
    expect((await loadRunRow(env.DB, runId))?.status).toBe('running')
  })

  it('rejects extra payload keys without writing D1', async () => {
    const env = createMemoryEnv()
    const snap = sealInvokeOnly(DRIVE_ORG)
    const runId = 'run_extra'
    await insertQueuedRun(env.DB, {
      runId,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    let invokeCount = 0
    await expect(
      driveFlowRun({
        step: immediateStep,
        db: env.DB as unknown as D1Database,
        invoke: async () => {
          invokeCount += 1
          return { output: 'echo' }
        },
        payload: { runId, orgId: DRIVE_ORG, snapshot: snap.runnerView },
        instanceId: INSTANCE_ID,
      }),
    ).rejects.toMatchObject({ name: 'DriveNonRetryableError', message: 'invalid payload' })
    expect(invokeCount).toBe(0)
    expect((await loadRunRow(env.DB, runId))?.status).toBe('queued')
  })

  it('catches invoke throw as INVOKE_FAILED without leaking the raw error', async () => {
    const env = createMemoryEnv()
    const snap = sealInvokeOnly(DRIVE_ORG)
    const runId = 'run_invoke_boom'
    await insertQueuedRun(env.DB, {
      runId,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    await expect(
      driveFlowRun({
        step: immediateStep,
        db: env.DB as unknown as D1Database,
        invoke: async () => {
          throw new Error('boom')
        },
        payload: { runId, orgId: DRIVE_ORG },
        instanceId: INSTANCE_ID,
      }),
    ).rejects.toBeInstanceOf(DriveNonRetryableError)
    const row = await loadRunRow(env.DB, runId)
    const tasks = JSON.parse(row?.receipt_json as string) as {
      tasks?: { echo_hello?: { outcome?: string; errorCode?: string } }
    }
    expect(row?.status).toBe('failed')
    expect(tasks.tasks?.echo_hello?.outcome).toBe('fail')
    expect(tasks.tasks?.echo_hello?.errorCode).toBe('INVOKE_FAILED')
  })

  it('fails UNKNOWN_TOOL when hasTool rejects a sealed execution tool', async () => {
    const env = createMemoryEnv()
    const snap = sealInvokeOnly(DRIVE_ORG)
    const runId = 'run_unknown_tool'
    await insertQueuedRun(env.DB, {
      runId,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    await expect(
      driveFlowRun({
        step: immediateStep,
        db: env.DB as unknown as D1Database,
        invoke: async () => ({ output: 'echo' }),
        hasTool: () => false,
        payload: { runId, orgId: DRIVE_ORG },
        instanceId: INSTANCE_ID,
      }),
    ).rejects.toBeInstanceOf(DriveNonRetryableError)
    const tasks = JSON.parse((await loadRunRow(env.DB, runId))?.receipt_json as string) as {
      tasks?: { echo_hello?: { errorCode?: string } }
    }
    expect(tasks.tasks?.echo_hello?.errorCode).toBe('UNKNOWN_TOOL')
  })
})
