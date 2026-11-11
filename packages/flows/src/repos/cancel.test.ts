import { drizzle } from 'drizzle-orm/d1'
import { describe, expect, it } from 'vitest'
import { flowsDrizzleSchema } from '../drizzle-schema'
import { createMemoryDb } from '../run/test/memory-db'
import { cancelRun, getRun, persistRunBundle } from './index'

async function seedRun(
  db: ReturnType<typeof createMemoryDb>,
  runId: string,
  orgId: string,
  status: string,
) {
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
      ) VALUES (?, ?, ?, ?, ?, 'actor', '{}', 'digest', ?, ?)`,
    )
    .bind(runId, orgId, `plan_${runId}`, runId, status, now, now)
    .run()
}

function kitDb(db: ReturnType<typeof createMemoryDb>) {
  return drizzle(db, { schema: flowsDrizzleSchema })
}

describe('cancelRun', () => {
  it('CAS queued or running → cancelled and returns 1', async () => {
    for (const status of ['queued', 'running'] as const) {
      const db = createMemoryDb()
      const runId = `run_${status}`
      await seedRun(db, runId, 'org_a', status)
      expect(await cancelRun(kitDb(db), { id: runId, orgId: 'org_a' })).toBe(1)
      expect((await getRun(kitDb(db), runId, 'org_a'))?.status).toBe('cancelled')
    }
  })

  it('returns 0 for foreign org and leaves status', async () => {
    const db = createMemoryDb()
    await seedRun(db, 'run_org', 'org_a', 'queued')
    expect(await cancelRun(kitDb(db), { id: 'run_org', orgId: 'org_b' })).toBe(0)
    expect((await getRun(kitDb(db), 'run_org', 'org_a'))?.status).toBe('queued')
  })

  it('returns 0 for terminal statuses', async () => {
    for (const status of ['succeeded', 'failed', 'cancelled'] as const) {
      const db = createMemoryDb()
      const runId = `run_${status}`
      await seedRun(db, runId, 'org_a', status)
      expect(await cancelRun(kitDb(db), { id: runId, orgId: 'org_a' })).toBe(0)
      expect((await getRun(kitDb(db), runId, 'org_a'))?.status).toBe(status)
    }
  })
})

// Characterization/regression: persistRunBundle already refuses non-queued|running on main
// (status IN guard). Kept here as the single pin for that path; do not duplicate in drive-cancel.
describe('persistRunBundle after cancel', () => {
  it('does not write succeeded over cancelled (characterization)', async () => {
    const db = createMemoryDb()
    await seedRun(db, 'run_persist', 'org_a', 'running')
    expect(await cancelRun(kitDb(db), { id: 'run_persist', orgId: 'org_a' })).toBe(1)
    const changes = await persistRunBundle(kitDb(db), {
      runId: 'run_persist',
      orgId: 'org_a',
      status: 'succeeded',
      receiptJson: JSON.stringify({ receiptVersion: 1, tokensUsed: 0, tasks: {} }),
    })
    expect(changes).toBe(0)
    expect((await getRun(kitDb(db), 'run_persist', 'org_a'))?.status).toBe('cancelled')
  })
})
