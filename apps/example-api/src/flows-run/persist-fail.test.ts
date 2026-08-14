import {
  createRunSnapshot,
  createToolRegistry,
  loadPlanFromYaml,
  parseReceipts,
  readRunRollup,
} from '@kit/flows'
import { describe, expect, it } from 'vitest'
import { createMemoryEnv } from '../test/memory-env'
import { DriveNonRetryableError, type DriveStep, driveFlowRun } from './drive'
import { INVOKE_ONLY_PLAN_YAML } from './fixtures'
import { persistBundle } from './persist'

type RunRow = {
  status: string
  error_code: string | null
  receipt_json: string | null
}

const immediateStep: DriveStep = async (_name, fn) => fn()

const registry = createToolRegistry('example-api-drive-v0', [
  { name: 'echo', description: 'Echo args (kit dogfood)', effect: 'read' },
])

const INSTANCE_ID = 'wfinst_persist_fail_v3'
const ORG = 'org_a'

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

async function insertQueued(
  db: ReturnType<typeof createMemoryEnv>['DB'],
  opts: { runId: string; orgId: string; snapshotJson: string; planDigest: string },
) {
  const now = Date.now()
  await db
    .prepare(
      `INSERT INTO flow_plans (id, org_id, plan_key, version, enabled, plan_json, plan_digest, created_at, updated_at)
       VALUES (?, ?, ?, 1, 1, '{}', ?, ?, ?)`,
    )
    .bind(`plan_${opts.runId}`, opts.orgId, 'echo-only', opts.planDigest, now, now)
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
    .prepare(`SELECT status, error_code, receipt_json FROM flow_runs WHERE id = ? AND org_id = ?`)
    .bind(runId, orgId)
    .first()) as RunRow | null
}

/** Real persist for running/failed; 0-row on the write that would mark succeeded. */
const persistZeroOnSucceeded: typeof persistBundle = async (db, input) => {
  if (input.status === 'succeeded') return 0
  return persistBundle(db, input)
}

async function drivePersistFail(runId: string) {
  const env = createMemoryEnv()
  const snap = seal(ORG)
  await insertQueued(env.DB, {
    runId,
    orgId: ORG,
    snapshotJson: JSON.stringify(snap.runnerView),
    planDigest: snap.runnerView.planDigest,
  })
  let invokeCount = 0
  let err: unknown
  await driveFlowRun({
    step: immediateStep,
    db: env.DB as unknown as D1Database,
    invoke: async () => {
      invokeCount += 1
      return { output: 'echo' }
    },
    persistBundle: persistZeroOnSucceeded,
    payload: { runId, orgId: ORG },
    instanceId: INSTANCE_ID,
  }).catch((caught) => {
    err = caught
  })
  return { row: await loadRun(env.DB, runId, ORG), invokeCount, err }
}

function rollupIgnoringCf(row: RunRow) {
  return readRunRollup({
    status: row.status,
    receiptJson: row.receipt_json,
    errorCode: row.error_code,
    instanceStatus: 'complete',
  } as never)
}

describe('driveFlowRun persist failure', () => {
  it('does not set status succeeded when persist returns 0 after invoke work', async () => {
    const { row, invokeCount, err } = await drivePersistFail('run_persist_zero')
    expect(invokeCount).toBe(1)
    expect(err).toBeInstanceOf(DriveNonRetryableError)
    expect((err as Error).message).toBe('persist lost')
    expect(row).toBeTruthy()
    expect(row?.status).not.toBe('succeeded')
    expect(['running', 'failed']).toContain(row?.status)
    const rollup = rollupIgnoringCf(row as RunRow)
    expect(rollup.status).not.toBe('succeeded')
    const parsed = parseReceipts(JSON.parse(row?.receipt_json as string) as unknown)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.receipts.tasks.echo_hello?.outcome).toBe('ok')
    }
  })

  it('sets status=failed and RECEIPTS_INVALID when receipt_json is corrupt', async () => {
    const env = createMemoryEnv()
    const snap = seal(ORG)
    const runId = 'run_bad_receipts'
    await insertQueued(env.DB, {
      runId,
      orgId: ORG,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    await env.DB.prepare(
      `UPDATE flow_runs SET status='queued', receipt_json=? WHERE id=? AND org_id=?`,
    )
      .bind('{not-json', runId, ORG)
      .run()
    let invokeCount = 0
    await driveFlowRun({
      step: immediateStep,
      db: env.DB as unknown as D1Database,
      invoke: async () => {
        invokeCount += 1
        return { output: 'echo' }
      },
      payload: { runId, orgId: ORG },
      instanceId: INSTANCE_ID,
    }).catch(() => {})
    const row = await loadRun(env.DB, runId, ORG)
    expect(invokeCount).toBe(0)
    expect(row?.status).toBe('failed')
    expect(row?.error_code).toBe('RECEIPTS_INVALID')
  })
})
