import { drizzle } from 'drizzle-orm/d1'
import { describe, expect, it } from 'vitest'
import { flowsDrizzleSchema } from '../drizzle-schema'
import { createMemoryDb } from '../run/test/memory-db'
import {
  claimRun,
  insertFlowRunEvent,
  listFlowRunEvents,
  markQueuedRunCreateFailed,
  persistRunBundle,
} from './index'

async function seedQueued(db: ReturnType<typeof createMemoryDb>, runId: string, orgId: string) {
  const now = Date.now()
  await db
    .prepare(
      `INSERT INTO flow_plans (id, org_id, plan_key, version, enabled, plan_json, plan_digest, created_at, updated_at)
       VALUES (?, ?, ?, 1, 1, '{}', 'digest', ?, ?)`,
    )
    .bind(`plan_${runId}`, orgId, runId, now, now)
    .run()
  await db
    .prepare(
      `INSERT INTO flow_runs (
        id, org_id, plan_id, plan_key, status, actor_id, snapshot_json, plan_digest, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'queued', 'actor', '{}', 'digest', ?, ?)`,
    )
    .bind(runId, orgId, `plan_${runId}`, runId, now, now)
    .run()
}

function kitDb(db: ReturnType<typeof createMemoryDb>) {
  return drizzle(db, { schema: flowsDrizzleSchema })
}

describe('flow_run_events (Roxabi/roxabi-boilerplate-cf#230)', () => {
  it('applies 0017 additively — flow_run_events exists and flow_runs is unchanged', async () => {
    const db = createMemoryDb()
    const cols = await db
      .prepare(`SELECT name FROM pragma_table_info('flow_run_events')`)
      .all<{ name: string }>()
    const colNames = (cols.results ?? []).map((c) => c.name)
    expect(colNames).toEqual(
      expect.arrayContaining([
        'id',
        'org_id',
        'run_id',
        'seq',
        'kind',
        'status_from',
        'status_to',
        'task_id',
        'outcome',
        'error_code',
        'created_at',
      ]),
    )
    expect(colNames).not.toContain('output')
    const runCols = await db
      .prepare(`SELECT name FROM pragma_table_info('flow_runs')`)
      .all<{ name: string }>()
    expect((runCols.results ?? []).map((c) => c.name)).toContain('receipt_json')
  })

  it('rejects an insert without org_id at the SQL layer', async () => {
    const db = createMemoryDb()
    await seedQueued(db, 'run_no_org', 'org_a')
    await expect(
      db
        .prepare(
          `INSERT INTO flow_run_events (id, run_id, seq, kind, created_at)
           VALUES ('evt_x', 'run_no_org', 1, 'status', 1)`,
        )
        .run(),
    ).rejects.toThrow()
  })

  it('claim writes one status event queued→running with the run org_id', async () => {
    const db = createMemoryDb()
    await seedQueued(db, 'run_claim', 'org_a')
    expect(
      await claimRun(kitDb(db), { runId: 'run_claim', orgId: 'org_a', instanceId: 'wf_1' }),
    ).toBe(1)
    const events = await listFlowRunEvents(kitDb(db), 'org_a', 'run_claim')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      orgId: 'org_a',
      runId: 'run_claim',
      seq: 1,
      kind: 'status',
      statusFrom: 'queued',
      statusTo: 'running',
    })
  })

  it('persist emits receipt events with task_id+outcome and no output column', async () => {
    const db = createMemoryDb()
    await seedQueued(db, 'run_recv', 'org_a')
    await claimRun(kitDb(db), { runId: 'run_recv', orgId: 'org_a', instanceId: 'wf_1' })
    const receipt = JSON.stringify({
      receiptVersion: 1,
      tokensUsed: 0,
      tasks: { echo: { taskId: 'echo', outcome: 'ok' } },
    })
    expect(
      await persistRunBundle(kitDb(db), {
        runId: 'run_recv',
        orgId: 'org_a',
        status: 'succeeded',
        receiptJson: receipt,
      }),
    ).toBe(1)
    const events = await listFlowRunEvents(kitDb(db), 'org_a', 'run_recv')
    const receiptEvt = events.find((e) => e.kind === 'receipt')
    expect(receiptEvt).toMatchObject({ taskId: 'echo', outcome: 'ok', orgId: 'org_a' })
    expect(receiptEvt).not.toHaveProperty('output')
    const statusEvt = events.find((e) => e.kind === 'status' && e.statusTo === 'succeeded')
    expect(statusEvt).toMatchObject({ statusFrom: 'running', statusTo: 'succeeded' })
  })

  it('listFlowRunEvents for org B on org A run is empty', async () => {
    const db = createMemoryDb()
    await seedQueued(db, 'run_iso', 'org_a')
    await claimRun(kitDb(db), { runId: 'run_iso', orgId: 'org_a', instanceId: 'wf_1' })
    expect(await listFlowRunEvents(kitDb(db), 'org_b', 'run_iso')).toEqual([])
  })

  it('markQueuedRunCreateFailed appends queued→failed', async () => {
    const db = createMemoryDb()
    await seedQueued(db, 'run_wf', 'org_a')
    expect(await markQueuedRunCreateFailed(kitDb(db), { id: 'run_wf', orgId: 'org_a' })).toBe(true)
    const events = await listFlowRunEvents(kitDb(db), 'org_a', 'run_wf')
    expect(events[0]).toMatchObject({
      kind: 'status',
      statusFrom: 'queued',
      statusTo: 'failed',
      errorCode: 'WORKFLOW_CREATE_FAILED',
    })
  })

  it('repo surface has insert+list only — no update/delete helpers', async () => {
    const mod = await import('./index')
    const names = Object.keys(mod).filter((k) => /flowRunEvent|FlowRunEvent/i.test(k))
    expect(names.sort()).toEqual(['insertFlowRunEvent', 'listFlowRunEvents'].sort())
    expect(mod).not.toHaveProperty('updateFlowRunEvent')
    expect(mod).not.toHaveProperty('deleteFlowRunEvent')
  })

  it('insertFlowRunEvent fails closed when the insert cannot land', async () => {
    const db = createMemoryDb()
    await seedQueued(db, 'run_gap', 'org_a')
    await db.prepare(`DROP TABLE flow_run_events`).run()
    await expect(
      insertFlowRunEvent(kitDb(db), {
        orgId: 'org_a',
        runId: 'run_gap',
        kind: 'status',
        statusFrom: 'queued',
        statusTo: 'running',
      }),
    ).rejects.toThrow()
  })
})
