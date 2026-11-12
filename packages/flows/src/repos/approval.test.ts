import { drizzle } from 'drizzle-orm/d1'
import { describe, expect, it } from 'vitest'
import { flowsDrizzleSchema } from '../drizzle-schema'
import { createMemoryDb } from '../run/test/memory-db'
import { recordRunApproval } from './index'

const WAITING = JSON.stringify({
  receiptVersion: 1,
  tokensUsed: 0,
  tasks: {
    gate1: { taskId: 'gate1', outcome: 'waiting' },
    gate2: { taskId: 'gate2', outcome: 'ok' },
  },
})

async function seedRun(db: ReturnType<typeof createMemoryDb>, runId: string, orgId: string) {
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
        id, org_id, plan_id, plan_key, status, actor_id, snapshot_json, plan_digest, receipt_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'running', 'actor', '{}', 'digest', ?, ?, ?)`,
    )
    .bind(runId, orgId, `plan_${runId}`, runId, WAITING, now, now)
    .run()
}

function kitDb(db: ReturnType<typeof createMemoryDb>) {
  return drizzle(db, { schema: flowsDrizzleSchema })
}

describe('recordRunApproval guards', () => {
  it('returns not_found for a foreign orgId and writes no row', async () => {
    const db = createMemoryDb()
    await seedRun(db, 'run_org', 'org_a')
    const result = await recordRunApproval(kitDb(db), {
      orgId: 'org_b',
      runId: 'run_org',
      taskId: 'gate1',
      decision: 'approved',
      decidedBy: 'user_staff',
    })
    expect(result).toEqual({ ok: false, reason: 'not_found' })
    const count = await db
      .prepare(`SELECT COUNT(*) AS n FROM flow_run_approvals`)
      .first<{ n: number }>()
    expect(count?.n).toBe(0)
  })

  it('returns not_waiting when the named task is not the waiting one', async () => {
    const db = createMemoryDb()
    await seedRun(db, 'run_tasks', 'org_a')
    const result = await recordRunApproval(kitDb(db), {
      orgId: 'org_a',
      runId: 'run_tasks',
      taskId: 'gate2',
      decision: 'approved',
      decidedBy: 'user_staff',
    })
    expect(result).toEqual({ ok: false, reason: 'not_waiting' })
    const count = await db
      .prepare(`SELECT COUNT(*) AS n FROM flow_run_approvals`)
      .first<{ n: number }>()
    expect(count?.n).toBe(0)
  })

  it('returns conflict when the same task is decided twice', async () => {
    const db = createMemoryDb()
    await seedRun(db, 'run_dup', 'org_a')
    const input = {
      orgId: 'org_a',
      runId: 'run_dup',
      taskId: 'gate1',
      decision: 'approved' as const,
      decidedBy: 'user_staff',
    }
    expect(await recordRunApproval(kitDb(db), input)).toEqual({ ok: true })
    expect(await recordRunApproval(kitDb(db), input)).toEqual({ ok: false, reason: 'conflict' })
  })

  it('throws on a database error even when the task id contains unique', async () => {
    const db = createMemoryDb()
    await seedRun(db, 'run_throw', 'org_a')
    await db.prepare(`DROP TABLE flow_run_approvals`).run()
    await expect(
      recordRunApproval(kitDb(db), {
        orgId: 'org_a',
        runId: 'run_throw',
        taskId: 'unique',
        decision: 'approved',
        decidedBy: 'user_staff',
      }),
    ).rejects.toThrow()
  })
})
