import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRunSnapshot, createToolRegistry, loadPlanFromYaml, mintCapabilityGrant } from '..'
import { type AwaitApprovalPort, runApproveStep } from './approve-step'
import type { DriveStep } from './drive'
import { loadRun, persistBundle } from './persist'
import { createMemoryDb } from './test/memory-db'

const ORG = 'org_a'
const RUN = 'run_approve_step'
const HOUR = 3_600_000
const T0 = Date.UTC(2026, 8, 28, 8, 0, 0)

const registry = createToolRegistry('example-api-drive-v0', [
  { name: 'echo', description: 'Echo args (kit dogfood)', grantClass: 'mintable' },
])

const PLAN = `flows: v0
plan:
  id: approve-step
permits:
  tools: []
tasks:
  gate:
    approve:
      timeout_hours: 1
`

async function seedRun(db: D1Database) {
  const minted = mintCapabilityGrant({
    orgId: ORG,
    registry,
    facts: { moduleEffective: true, canRead: true, canWrite: true, allowedModels: [] },
  })
  if (!minted.ok) throw new Error(minted.message)
  const sealed = createRunSnapshot({
    plan: loadPlanFromYaml(PLAN),
    grant: minted.grant,
    registry,
    actorId: 'actor_1',
  })
  if (!sealed.ok) throw new Error(sealed.issues.map((i) => i.code).join(','))
  const now = Date.now()
  await db
    .prepare(
      `INSERT INTO flow_plans (id, org_id, plan_key, version, enabled, plan_json, plan_digest, created_at, updated_at)
       VALUES ('plan_1', ?, 'approve-step', 1, 1, '{}', ?, ?, ?)`,
    )
    .bind(ORG, sealed.runnerView.planDigest, now, now)
    .run()
  await db
    .prepare(
      `INSERT INTO flow_runs (id, org_id, plan_id, plan_key, status, actor_id, snapshot_json, plan_digest, created_at, updated_at)
       VALUES (?, ?, 'plan_1', 'approve-step', 'running', 'actor_1', ?, ?, ?, ?)`,
    )
    .bind(RUN, ORG, JSON.stringify(sealed.runnerView), sealed.runnerView.planDigest, now, now)
    .run()
}

const immediateStep: DriveStep = async (_name, fn) => fn()

/** A Cloudflare-like step: results are recorded by name and replayed, never re-run. */
function recordingStep(cache: Map<string, unknown>, names: string[]): DriveStep {
  return async (name, fn) => {
    names.push(name)
    if (cache.has(name)) return cache.get(name) as never
    const out = await fn()
    cache.set(name, out)
    return out
  }
}

/** The shell's port: `step.waitForEvent`, also recorded by name; records what each wait asked. */
function recordingWait(cache: Map<string, unknown>, asked: number[]): AwaitApprovalPort {
  return async (taskId, remainingMs, attempt) => {
    const name = `approval:${taskId}:${attempt}`
    if (cache.has(name)) return cache.get(name) as 'event' | 'timeout'
    asked.push(remainingMs)
    cache.set(name, 'event')
    return 'event'
  }
}

async function run(db: D1Database, step: DriveStep, wait: AwaitApprovalPort) {
  await runApproveStep({
    step,
    awaitApproval: wait,
    taskId: 'gate',
    timeoutHours: 1,
    io: {
      persist: persistBundle,
      load: loadRun,
      db,
      ids: { runId: RUN, orgId: ORG },
      taskIds: ['gate'],
    },
  })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('runApproveStep', () => {
  it('waits only the time left until the deadline recorded when the task opened', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)
    const db = createMemoryDb()
    await seedRun(db)
    const cache = new Map<string, unknown>()
    const asked: number[] = []
    const wait = recordingWait(cache, [])
    let calls = 0
    const timedWait: AwaitApprovalPort = async (taskId, remainingMs, attempt) => {
      asked.push(remainingMs)
      calls += 1
      vi.setSystemTime(T0 + calls * 10 * 60_000)
      return wait(taskId, remainingMs, attempt)
    }
    await run(db, recordingStep(cache, []), timedWait)
    expect(asked.slice(0, 3)).toEqual([HOUR, HOUR - 10 * 60_000, HOUR - 20 * 60_000])
    const receipts = JSON.parse((await loadRun(db, RUN, ORG))?.receipt_json ?? '{}')
    expect(receipts.tasks.gate).toMatchObject({ outcome: 'fail', errorCode: 'APPROVAL_TIMEOUT' })
  })

  it('replays the recorded path after the deadline instead of taking a new one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)
    const db = createMemoryDb()
    await seedRun(db)
    const cache = new Map<string, unknown>()
    const first: string[] = []
    // Original execution: one wake without a row, then the approver decides.
    const wait: AwaitApprovalPort = async (taskId, _remainingMs, attempt) => {
      const name = `approval:${taskId}:${attempt}`
      if (cache.has(name)) return cache.get(name) as 'event'
      first.push(name)
      cache.set(name, 'event')
      if (attempt === 1) {
        await db
          .prepare(
            `INSERT INTO flow_run_approvals (id, org_id, run_id, task_id, decision, decided_by, decided_at)
             VALUES ('ap_1', ?, ?, 'gate', 'approved', 'user_staff', ?)`,
          )
          .bind(ORG, RUN, T0 + 50 * 60_000)
          .run()
      }
      vi.setSystemTime(T0 + (attempt + 1) * 30 * 60_000)
      return 'event'
    }
    const original: string[] = []
    await run(db, recordingStep(cache, original), wait)

    // Replay long after the deadline: every step and wait answers from the record.
    vi.setSystemTime(T0 + 5 * HOUR)
    const replay: string[] = []
    await run(db, recordingStep(cache, replay), wait)
    expect(replay).toEqual(original)
    expect(first).toEqual(['approval:gate:0', 'approval:gate:1'])
    const rows = await db
      .prepare(`SELECT decision FROM flow_run_approvals WHERE run_id = ?`)
      .bind(RUN)
      .all()
    expect(rows.results).toEqual([{ decision: 'approved' }])
  })

  it('open writes waiting and never started', async () => {
    const db = createMemoryDb()
    await seedRun(db)
    const outcomes: string[] = []
    await runApproveStep({
      step: immediateStep,
      awaitApproval: async () => {
        await db
          .prepare(
            `INSERT INTO flow_run_approvals (id, org_id, run_id, task_id, decision, decided_by, decided_at)
             VALUES ('ap_wait', ?, ?, 'gate', 'approved', 'user_staff', ?)`,
          )
          .bind(ORG, RUN, Date.now())
          .run()
        return 'event'
      },
      taskId: 'gate',
      timeoutHours: 1,
      io: {
        persist: async (database, input) => {
          const gate = JSON.parse(input.receiptJson).tasks?.gate
          if (gate?.outcome) outcomes.push(gate.outcome)
          return persistBundle(database, input)
        },
        load: loadRun,
        db,
        ids: { runId: RUN, orgId: ORG },
        taskIds: ['gate'],
      },
    })
    expect(outcomes[0]).toBe('waiting')
    expect(outcomes).not.toContain('started')
    const receipts = JSON.parse((await loadRun(db, RUN, ORG))?.receipt_json ?? '{}')
    expect(receipts.tasks.gate.outcome).not.toBe('started')
  })
})
