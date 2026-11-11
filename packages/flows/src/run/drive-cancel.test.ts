import { describe, expect, it } from 'vitest'
import { createRunSnapshot, createToolRegistry, loadPlanFromYaml, mintCapabilityGrant } from '..'
import { driveFlowRun } from './drive'
import { INVOKE_ONLY_PLAN_YAML } from './fixtures'
import { loadRun as persistLoadRun } from './persist'
import { createMemoryDb } from './test/memory-db'

const registry = createToolRegistry('example-api-drive-v0', [
  { name: 'echo', description: 'Echo args (kit dogfood)', grantClass: 'mintable' },
])

const INFER_ONLY_PLAN_YAML = `flows: v0
plan:
  id: cancel-infer
  model: kit-infer
  max_tokens: 100
permits:
  tools:
    - echo
tasks:
  think:
    infer:
      prompt: "cancel-check"
      max_tokens: 40
`

const APPROVE_THEN_ECHO_YAML = `flows: v0
plan:
  id: cancel-approve
permits:
  tools:
    - echo
tasks:
  gate:
    approve: {}
  echo_hello:
    after:
      - gate
    invoke:
      tool: echo
      args:
        text: after-approve
`

function mintFixtureGrant(orgId: string, allowedModels: string[] = []) {
  const minted = mintCapabilityGrant({
    orgId,
    registry,
    facts: { moduleEffective: true, canRead: true, canWrite: true, allowedModels },
  })
  if (!minted.ok) throw new Error(`fixture grant must mint: ${minted.message}`)
  return minted.grant
}

function seal(orgId: string, yaml = INVOKE_ONLY_PLAN_YAML, allowedModels: string[] = []) {
  const plan = loadPlanFromYaml(yaml)
  const result = createRunSnapshot({
    plan,
    grant: mintFixtureGrant(orgId, allowedModels),
    registry,
    actorId: 'actor_1',
  })
  if (!result.ok) {
    throw new Error(`fixture snapshot failed: ${result.issues.map((i) => i.code).join(',')}`)
  }
  return result
}

async function insertQueued(
  db: ReturnType<typeof createMemoryDb>,
  opts: { runId: string; orgId: string; snapshotJson: string; planDigest: string; planKey: string },
) {
  const now = Date.now()
  await db
    .prepare(
      `INSERT INTO flow_plans (id, org_id, plan_key, version, enabled, plan_json, plan_digest, created_at, updated_at)
       VALUES (?, ?, ?, 1, 1, '{}', ?, ?, ?)`,
    )
    .bind(`plan_${opts.runId}`, opts.orgId, opts.planKey, opts.planDigest, now, now)
    .run()
  await db
    .prepare(
      `INSERT INTO flow_runs (
        id, org_id, plan_id, plan_key, status, actor_id, snapshot_json, plan_digest, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'queued', 'actor_1', ?, ?, ?, ?)`,
    )
    .bind(
      opts.runId,
      opts.orgId,
      `plan_${opts.runId}`,
      opts.planKey,
      opts.snapshotJson,
      opts.planDigest,
      now,
      now,
    )
    .run()
}

describe('drive cancel re-check', () => {
  it('does not call invoke when status is cancelled before the port', async () => {
    const orgId = 'org_a'
    const runId = 'run_cancel_invoke'
    const snap = seal(orgId)
    const db = createMemoryDb()
    await insertQueued(db, {
      runId,
      orgId,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
      planKey: 'echo-only',
    })

    let invokes = 0
    await expect(
      driveFlowRun({
        step: async (name, fn) => {
          if (name.startsWith('invoke:')) {
            await db
              .prepare(`UPDATE flow_runs SET status = 'cancelled' WHERE id = ?`)
              .bind(runId)
              .run()
          }
          return fn()
        },
        db,
        invoke: async () => {
          invokes += 1
          return { output: 'late' }
        },
        payload: { runId, orgId },
        instanceId: runId,
      }),
    ).rejects.toMatchObject({ name: 'DriveNonRetryableError', message: 'cancelled' })
    expect(invokes).toBe(0)
    const row = await persistLoadRun(db, runId, orgId)
    expect(row?.status).toBe('cancelled')
  })

  it('does not call infer when status is cancelled before the port', async () => {
    const orgId = 'org_a'
    const runId = 'run_cancel_infer'
    const snap = seal(orgId, INFER_ONLY_PLAN_YAML, ['kit-infer'])
    const db = createMemoryDb()
    await insertQueued(db, {
      runId,
      orgId,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
      planKey: 'cancel-infer',
    })

    let infers = 0
    await expect(
      driveFlowRun({
        step: async (name, fn) => {
          if (name.startsWith('infer:')) {
            await db
              .prepare(`UPDATE flow_runs SET status = 'cancelled' WHERE id = ?`)
              .bind(runId)
              .run()
          }
          return fn()
        },
        db,
        invoke: async () => ({ output: 'unused' }),
        infer: async () => {
          infers += 1
          return { text: 'late', tokens: 1 }
        },
        payload: { runId, orgId },
        instanceId: runId,
      }),
    ).rejects.toMatchObject({ name: 'DriveNonRetryableError', message: 'cancelled' })
    expect(infers).toBe(0)
    const row = await persistLoadRun(db, runId, orgId)
    expect(row?.status).toBe('cancelled')
  })

  it('does not call awaitApproval when status is cancelled before the wait', async () => {
    const orgId = 'org_a'
    const runId = 'run_cancel_approve'
    const snap = seal(orgId, APPROVE_THEN_ECHO_YAML)
    const db = createMemoryDb()
    await insertQueued(db, {
      runId,
      orgId,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
      planKey: 'cancel-approve',
    })

    let awaits = 0
    let invokes = 0
    await expect(
      driveFlowRun({
        step: async (name, fn) => {
          if (name === 'approve:clock:gate:0') {
            await db
              .prepare(`UPDATE flow_runs SET status = 'cancelled' WHERE id = ?`)
              .bind(runId)
              .run()
          }
          return fn()
        },
        db,
        invoke: async () => {
          invokes += 1
          return { output: 'late' }
        },
        awaitApproval: async () => {
          awaits += 1
          return 'timeout'
        },
        payload: { runId, orgId },
        instanceId: runId,
      }),
    ).rejects.toMatchObject({ name: 'DriveNonRetryableError', message: 'cancelled' })
    expect(awaits).toBe(0)
    expect(invokes).toBe(0)
    const row = await persistLoadRun(db, runId, orgId)
    expect(row?.status).toBe('cancelled')
  })
})
