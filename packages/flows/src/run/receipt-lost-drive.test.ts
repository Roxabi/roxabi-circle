import { describe, expect, it } from 'vitest'
import { interpretRun } from '../interpret'
import { type DriveStep, driveFlowRun } from './drive'
import { CHAIN_INVOKE_PLAN_YAML, INVOKE_ONLY_PLAN_YAML } from './fixtures'
import { loadRun, persistBundle } from './persist'
import { createMemoryDb } from './test/memory-db'
import { SEED_ORG, seedRun, taskReceipts } from './test/seed-run'

const immediate: DriveStep = async (_name, fn) => fn()

/** Cloudflare-like: a named step result is replayed, never re-run. */
function memoStep(cache: Map<string, unknown>): DriveStep {
  return async (name, fn) => {
    if (cache.has(name)) return cache.get(name) as never
    const out = await fn()
    cache.set(name, out)
    return out
  }
}

describe('receipt lost drive', () => {
  it('does not roll up succeeded when started sits beside ok', async () => {
    const view = await seedRun(createMemoryDb(), {
      runId: 'run_view',
      planYaml: CHAIN_INVOKE_PLAN_YAML,
      status: 'running',
    })
    const result = interpretRun(view, {
      receiptVersion: 1,
      tokensUsed: 0,
      tasks: {
        echo_a: { taskId: 'echo_a', outcome: 'ok' },
        echo_b: { taskId: 'echo_b', outcome: 'started' },
      },
    })
    expect(result.rollup).toBe('failed')
    expect(result.readyTaskIds).toEqual([])
  })

  it('closes a started wave as RECEIPT_LOST and never persists started on a failed run', async () => {
    const db = createMemoryDb()
    await seedRun(db, {
      runId: 'run_chain',
      planYaml: CHAIN_INVOKE_PLAN_YAML,
      status: 'queued',
      tasks: { echo_a: { outcome: 'started' } },
    })
    let calls = 0
    await expect(
      driveFlowRun({
        step: immediate,
        db,
        invoke: async () => {
          calls += 1
          return { output: 'x' }
        },
        payload: { runId: 'run_chain', orgId: SEED_ORG },
        instanceId: 'wfinst_lost',
      }),
    ).rejects.toMatchObject({ name: 'DriveNonRetryableError', message: 'RECEIPT_LOST' })
    expect(calls).toBe(0)
    const row = await taskReceipts(db, 'run_chain')
    expect(row.status).toBe('failed')
    expect(row.errorCode).toBe('RECEIPT_LOST')
    expect(row.tasks.echo_a).toMatchObject({ outcome: 'fail', errorCode: 'RECEIPT_LOST' })
    expect(row.tasks.echo_b?.outcome).toBe('skip')
  })

  it('replays a memoized stale load while D1 holds started: 0 port calls, RECEIPT_LOST', async () => {
    const db = createMemoryDb()
    await seedRun(db, {
      runId: 'run_replay',
      planYaml: CHAIN_INVOKE_PLAN_YAML,
      status: 'running',
      tasks: { echo_a: { outcome: 'started' } },
    })
    const stale = await loadRun(db, 'run_replay', SEED_ORG)
    if (!stale) throw new Error('seed missing')
    const cache = new Map<string, unknown>([
      ['claim', undefined],
      [
        'load',
        { ...stale, receipt_json: JSON.stringify({ receiptVersion: 1, tokensUsed: 0, tasks: {} }) },
      ],
    ])
    let calls = 0
    await expect(
      driveFlowRun({
        step: memoStep(cache),
        db,
        invoke: async () => {
          calls += 1
          return { output: 'twice' }
        },
        payload: { runId: 'run_replay', orgId: SEED_ORG },
        instanceId: 'wfinst_replay',
      }),
    ).rejects.toMatchObject({ message: 'RECEIPT_LOST' })
    expect(calls).toBe(0)
    const row = await taskReceipts(db, 'run_replay')
    expect(row.status).toBe('failed')
    expect(row.errorCode).toBe('RECEIPT_LOST')
  })

  it('closes an orphaned started receipt when the terminal task write fails transiently', async () => {
    const db = createMemoryDb()
    await seedRun(db, { runId: 'run_orphan', planYaml: INVOKE_ONLY_PLAN_YAML, status: 'queued' })
    let calls = 0
    let failed = false
    await expect(
      driveFlowRun({
        step: immediate,
        db,
        invoke: async () => {
          calls += 1
          return { output: 'done' }
        },
        persistBundle: async (database, input) => {
          if (!failed && input.receiptJson.includes('"outcome":"ok"')) {
            failed = true
            throw new Error('D1 transient')
          }
          return persistBundle(database, input)
        },
        payload: { runId: 'run_orphan', orgId: SEED_ORG },
        instanceId: 'wfinst_orphan',
      }),
    ).rejects.toThrow('D1 transient')
    expect(calls).toBe(1)
    const row = await taskReceipts(db, 'run_orphan')
    expect(row.status).toBe('failed')
    expect(row.errorCode).toBe('RECEIPT_LOST')
    expect(row.tasks.echo_hello).toMatchObject({ outcome: 'fail', errorCode: 'RECEIPT_LOST' })
  })

  it('scrubs started to RECEIPT_LOST when cancel races the orphan close', async () => {
    const db = createMemoryDb()
    await seedRun(db, { runId: 'run_cancel', planYaml: INVOKE_ONLY_PLAN_YAML, status: 'queued' })
    let calls = 0
    await expect(
      driveFlowRun({
        step: immediate,
        db,
        invoke: async () => {
          calls += 1
          await db
            .prepare(`UPDATE flow_runs SET status = 'cancelled' WHERE id = ? AND org_id = ?`)
            .bind('run_cancel', SEED_ORG)
            .run()
          return { output: 'too-late' }
        },
        payload: { runId: 'run_cancel', orgId: SEED_ORG },
        instanceId: 'wfinst_cancel',
      }),
    ).rejects.toMatchObject({ name: 'DriveNonRetryableError', message: 'cancelled' })
    expect(calls).toBe(1)
    const row = await taskReceipts(db, 'run_cancel')
    expect(row.status).toBe('cancelled')
    expect(row.tasks.echo_hello).toMatchObject({ outcome: 'fail', errorCode: 'RECEIPT_LOST' })
  })
})
