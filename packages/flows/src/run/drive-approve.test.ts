import { describe, expect, it } from 'vitest'
import { createRunSnapshot, createToolRegistry, loadPlanFromYaml, mintCapabilityGrant } from '..'
import { DriveNonRetryableError, type DriveStep, driveFlowRun } from './drive'
import { createMemoryDb } from './test/memory-db'

const ORG = 'org_a'
const OTHER = 'org_b'
const immediateStep: DriveStep = async (_name, fn) => fn()

const registry = createToolRegistry('example-api-drive-v0', [
  { name: 'echo', description: 'Echo args (kit dogfood)', grantClass: 'mintable' },
])

const APPROVE_THEN_ECHO = `flows: v0
plan:
  id: approve-then-echo
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

function mint(orgId: string) {
  const minted = mintCapabilityGrant({
    orgId,
    registry,
    facts: { moduleEffective: true, canRead: true, canWrite: true, allowedModels: [] },
  })
  if (!minted.ok) throw new Error(minted.message)
  return minted.grant
}

function seal(orgId: string, yaml = APPROVE_THEN_ECHO) {
  const plan = loadPlanFromYaml(yaml)
  const result = createRunSnapshot({ plan, grant: mint(orgId), registry, actorId: 'actor_1' })
  if (!result.ok) throw new Error(result.issues.map((i) => i.code).join(','))
  return result
}

async function insertQueued(
  db: ReturnType<typeof createMemoryDb>,
  opts: { runId: string; orgId: string; snapshotJson: string; planDigest: string },
) {
  const now = Date.now()
  await db
    .prepare(
      `INSERT INTO flow_plans (id, org_id, plan_key, version, enabled, plan_json, plan_digest, created_at, updated_at)
       VALUES (?, ?, ?, 1, 1, '{}', ?, ?, ?)`,
    )
    .bind(`plan_${opts.runId}`, opts.orgId, opts.runId, opts.planDigest, now, now)
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
      'approve-then-echo',
      'actor_1',
      opts.snapshotJson,
      opts.planDigest,
      now,
      now,
    )
    .run()
}

async function insertApproval(
  db: ReturnType<typeof createMemoryDb>,
  opts: {
    id: string
    orgId: string
    runId: string
    taskId: string
    decision: 'approved' | 'rejected'
    by: string
  },
) {
  await db
    .prepare(
      `INSERT INTO flow_run_approvals (id, org_id, run_id, task_id, decision, decided_by, decided_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(opts.id, opts.orgId, opts.runId, opts.taskId, opts.decision, opts.by, 1_700_000_000_000)
    .run()
}

type Row = { status: string; error_code: string | null; receipt_json: string | null }

async function load(db: ReturnType<typeof createMemoryDb>, runId: string, orgId: string) {
  return (await db
    .prepare(`SELECT status, error_code, receipt_json FROM flow_runs WHERE id = ? AND org_id = ?`)
    .bind(runId, orgId)
    .first()) as Row | null
}

function tasksOf(row: Row | null) {
  return (
    JSON.parse(row?.receipt_json ?? '{}') as {
      tasks: Record<
        string,
        { outcome?: string; errorCode?: string; approval?: { by: string; at: string } }
      >
    }
  ).tasks
}

describe('driveFlowRun approve', () => {
  it('fails closed APPROVAL_UNSUPPORTED when the port is absent and does not invoke', async () => {
    const db = createMemoryDb()
    const snap = seal(ORG)
    await insertQueued(db, {
      runId: 'run_unsupported',
      orgId: ORG,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    let invokes = 0
    await expect(
      driveFlowRun({
        step: immediateStep,
        db,
        invoke: async () => {
          invokes += 1
          return { output: 'no' }
        },
        payload: { runId: 'run_unsupported', orgId: ORG },
        instanceId: 'wfinst_approve',
      }),
    ).rejects.toBeInstanceOf(DriveNonRetryableError)
    const row = await load(db, 'run_unsupported', ORG)
    expect(row?.status).toBe('failed')
    expect(row?.error_code).toBe('APPROVAL_UNSUPPORTED')
    expect(tasksOf(row).gate?.errorCode).toBe('APPROVAL_UNSUPPORTED')
    expect(invokes).toBe(0)
  })

  it('writes waiting, then ok with approval, then runs the downstream invoke', async () => {
    const db = createMemoryDb()
    const snap = seal(ORG)
    await insertQueued(db, {
      runId: 'run_ok',
      orgId: ORG,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    const names: string[] = []
    const step: DriveStep = async (name, fn) => {
      names.push(name)
      return fn()
    }
    let invokes = 0
    const args: unknown[][] = []
    await driveFlowRun({
      step,
      db,
      invoke: async () => {
        invokes += 1
        return { output: 'after-approve' }
      },
      awaitApproval: async (taskId, hours, attempt) => {
        args.push([taskId, hours, attempt])
        const mid = await load(db, 'run_ok', ORG)
        expect(tasksOf(mid).gate?.outcome).toBe('waiting')
        await insertApproval(db, {
          id: 'appr_ok',
          orgId: ORG,
          runId: 'run_ok',
          taskId: 'gate',
          decision: 'approved',
          by: 'user_staff',
        })
        return 'event'
      },
      payload: { runId: 'run_ok', orgId: ORG },
      instanceId: 'wfinst_approve',
    })
    const row = await load(db, 'run_ok', ORG)
    expect(row?.status).toBe('succeeded')
    expect(tasksOf(row).gate?.outcome).toBe('ok')
    expect(tasksOf(row).gate?.approval).toEqual({
      by: 'user_staff',
      at: new Date(1_700_000_000_000).toISOString(),
    })
    expect(tasksOf(row).echo_hello?.outcome).toBe('ok')
    expect(invokes).toBe(1)
    expect(args[0]?.[0]).toBe('gate')
    expect(args[0]?.[2]).toBe(0)
    expect(args[0]?.[1]).toBeGreaterThan(23 * 60 * 60 * 1000)
    expect(names).toContain('approve:open:gate')
    expect(names).toContain('approve:read:gate:0')
    expect(names).toContain('approve:resolve:gate')
  })

  it('fails APPROVAL_REJECTED and does not invoke', async () => {
    const db = createMemoryDb()
    const snap = seal(ORG)
    await insertQueued(db, {
      runId: 'run_rej',
      orgId: ORG,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    let invokes = 0
    await expect(
      driveFlowRun({
        step: immediateStep,
        db,
        invoke: async () => {
          invokes += 1
          return {}
        },
        awaitApproval: async () => {
          await insertApproval(db, {
            id: 'appr_rej',
            orgId: ORG,
            runId: 'run_rej',
            taskId: 'gate',
            decision: 'rejected',
            by: 'user_staff',
          })
          return 'event'
        },
        payload: { runId: 'run_rej', orgId: ORG },
        instanceId: 'wfinst_approve',
      }),
    ).rejects.toThrow(/APPROVAL_REJECTED/)
    const row = await load(db, 'run_rej', ORG)
    expect(row?.status).toBe('failed')
    expect(row?.error_code).toBe('APPROVAL_REJECTED')
    expect(tasksOf(row).gate?.outcome).toBe('fail')
    expect(tasksOf(row).gate?.approval?.by).toBe('user_staff')
    expect(tasksOf(row).echo_hello?.outcome).toBe('skip')
    expect(invokes).toBe(0)
  })

  it('does not continue on a wake with no row; a later timeout expires the task', async () => {
    const db = createMemoryDb()
    const snap = seal(ORG)
    await insertQueued(db, {
      runId: 'run_miss',
      orgId: ORG,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    let invokes = 0
    let wakes = 0
    const realNow = Date.now
    let now = realNow()
    Date.now = () => now
    try {
      await expect(
        driveFlowRun({
          step: immediateStep,
          db,
          invoke: async () => {
            invokes += 1
            return {}
          },
          awaitApproval: async () => {
            wakes += 1
            if (wakes === 1) return 'event'
            now += 48 * 60 * 60 * 1000
            return 'timeout'
          },
          payload: { runId: 'run_miss', orgId: ORG },
          instanceId: 'wfinst_approve',
        }),
      ).rejects.toThrow(/APPROVAL_TIMEOUT/)
    } finally {
      Date.now = realNow
    }
    expect(wakes).toBe(2)
    expect((await load(db, 'run_miss', ORG))?.error_code).toBe('APPROVAL_TIMEOUT')
    expect(invokes).toBe(0)
  })

  it('fails APPROVAL_TIMEOUT when the wait ends with no row', async () => {
    const db = createMemoryDb()
    const snap = seal(ORG)
    await insertQueued(db, {
      runId: 'run_to',
      orgId: ORG,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    await expect(
      driveFlowRun({
        step: immediateStep,
        db,
        invoke: async () => ({ output: 'no' }),
        awaitApproval: async () => 'timeout',
        payload: { runId: 'run_to', orgId: ORG },
        instanceId: 'wfinst_approve',
      }),
    ).rejects.toThrow(/APPROVAL_TIMEOUT/)
    expect((await load(db, 'run_to', ORG))?.error_code).toBe('APPROVAL_TIMEOUT')
  })

  it('proceeds on timeout when an approved row is already written', async () => {
    const db = createMemoryDb()
    const snap = seal(ORG)
    await insertQueued(db, {
      runId: 'run_to_ok',
      orgId: ORG,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    let invokes = 0
    await driveFlowRun({
      step: immediateStep,
      db,
      invoke: async () => {
        invokes += 1
        return { output: 'ok' }
      },
      awaitApproval: async () => {
        await insertApproval(db, {
          id: 'appr_to',
          orgId: ORG,
          runId: 'run_to_ok',
          taskId: 'gate',
          decision: 'approved',
          by: 'user_staff',
        })
        return 'timeout'
      },
      payload: { runId: 'run_to_ok', orgId: ORG },
      instanceId: 'wfinst_approve',
    })
    const row = await load(db, 'run_to_ok', ORG)
    expect(row?.status).toBe('succeeded')
    expect(tasksOf(row).gate?.outcome).toBe('ok')
    expect(invokes).toBe(1)
  })

  it('ignores an approval row for another org and run', async () => {
    const db = createMemoryDb()
    const snap = seal(ORG)
    const other = seal(OTHER)
    await insertQueued(db, {
      runId: 'run_mine',
      orgId: ORG,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    await insertQueued(db, {
      runId: 'run_other',
      orgId: OTHER,
      snapshotJson: JSON.stringify(other.runnerView),
      planDigest: other.runnerView.planDigest,
    })
    await insertApproval(db, {
      id: 'appr_other',
      orgId: OTHER,
      runId: 'run_other',
      taskId: 'gate',
      decision: 'approved',
      by: 'user_other',
    })
    let invokes = 0
    await expect(
      driveFlowRun({
        step: immediateStep,
        db,
        invoke: async () => {
          invokes += 1
          return {}
        },
        awaitApproval: async () => 'timeout',
        payload: { runId: 'run_mine', orgId: ORG },
        instanceId: 'wfinst_approve',
      }),
    ).rejects.toThrow(/APPROVAL_TIMEOUT/)
    expect((await load(db, 'run_mine', ORG))?.error_code).toBe('APPROVAL_TIMEOUT')
    expect(invokes).toBe(0)
  })

  it('does not terminal a waiting receipt when a fresh drive resumes on a row', async () => {
    const db = createMemoryDb()
    const snap = seal(ORG)
    await insertQueued(db, {
      runId: 'run_resume',
      orgId: ORG,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    await db
      .prepare(
        `UPDATE flow_runs SET status = 'running', workflow_instance_id = ?, receipt_json = ? WHERE id = ?`,
      )
      .bind(
        'wfinst_approve',
        JSON.stringify({
          receiptVersion: 1,
          tokensUsed: 0,
          tasks: { gate: { taskId: 'gate', outcome: 'waiting' } },
        }),
        'run_resume',
      )
      .run()
    await insertApproval(db, {
      id: 'appr_resume',
      orgId: ORG,
      runId: 'run_resume',
      taskId: 'gate',
      decision: 'approved',
      by: 'user_staff',
    })
    let invokes = 0
    await driveFlowRun({
      step: immediateStep,
      db,
      invoke: async () => {
        invokes += 1
        return { output: 'resumed' }
      },
      awaitApproval: async () => {
        throw new Error('must not wait when the row is already present')
      },
      payload: { runId: 'run_resume', orgId: ORG },
      instanceId: 'wfinst_approve',
    })
    expect((await load(db, 'run_resume', ORG))?.status).toBe('succeeded')
    expect(invokes).toBe(1)
  })

  it('does not continue a second run from another run approval of the same task id', async () => {
    const db = createMemoryDb()
    const snap = seal(ORG)
    await insertQueued(db, {
      runId: 'run_r1',
      orgId: ORG,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    await insertQueued(db, {
      runId: 'run_r2',
      orgId: ORG,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    await insertApproval(db, {
      id: 'appr_r1',
      orgId: ORG,
      runId: 'run_r1',
      taskId: 'gate',
      decision: 'approved',
      by: 'user_staff',
    })
    let invokes = 0
    await expect(
      driveFlowRun({
        step: immediateStep,
        db,
        invoke: async () => {
          invokes += 1
          return {}
        },
        awaitApproval: async () => 'timeout',
        payload: { runId: 'run_r2', orgId: ORG },
        instanceId: 'wfinst_approve',
      }),
    ).rejects.toThrow(/APPROVAL_TIMEOUT/)
    expect(invokes).toBe(0)
    expect((await load(db, 'run_r2', ORG))?.status).toBe('failed')
  })

  it('does not treat gate1 approval as gate2 approval', async () => {
    const yaml = `flows: v0
plan:
  id: two-gates
permits:
  tools:
    - echo
tasks:
  gate1:
    approve: {}
  gate2:
    after:
      - gate1
    approve: {}
  echo_hello:
    after:
      - gate2
    invoke:
      tool: echo
`
    const db = createMemoryDb()
    const snap = seal(ORG, yaml)
    await insertQueued(db, {
      runId: 'run_two',
      orgId: ORG,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    let invokes = 0
    await expect(
      driveFlowRun({
        step: immediateStep,
        db,
        invoke: async () => {
          invokes += 1
          return {}
        },
        awaitApproval: async (taskId) => {
          if (taskId === 'gate1') {
            await insertApproval(db, {
              id: 'appr_g1',
              orgId: ORG,
              runId: 'run_two',
              taskId: 'gate1',
              decision: 'approved',
              by: 'user_staff',
            })
            return 'event'
          }
          return 'timeout'
        },
        payload: { runId: 'run_two', orgId: ORG },
        instanceId: 'wfinst_approve',
      }),
    ).rejects.toThrow(/APPROVAL_TIMEOUT/)
    const tasks = tasksOf(await load(db, 'run_two', ORG))
    expect(tasks.gate1?.outcome).toBe('ok')
    expect(tasks.gate2?.outcome).not.toBe('ok')
    expect(tasks.gate2?.errorCode).toBe('APPROVAL_TIMEOUT')
    expect(invokes).toBe(0)
  })

  it('lets an approval written before the deadline win over a timeout wake', async () => {
    const db = createMemoryDb()
    const snap = seal(ORG)
    await insertQueued(db, {
      runId: 'run_before',
      orgId: ORG,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    let invokes = 0
    await driveFlowRun({
      step: immediateStep,
      db,
      invoke: async () => {
        invokes += 1
        return { output: 'won' }
      },
      awaitApproval: async () => {
        await insertApproval(db, {
          id: 'appr_before',
          orgId: ORG,
          runId: 'run_before',
          taskId: 'gate',
          decision: 'approved',
          by: 'user_staff',
        })
        return 'timeout'
      },
      payload: { runId: 'run_before', orgId: ORG },
      instanceId: 'wfinst_approve',
    })
    const row = await load(db, 'run_before', ORG)
    expect(row?.status).toBe('succeeded')
    expect(tasksOf(row).gate?.outcome).toBe('ok')
    expect(invokes).toBe(1)
    const expired = await db
      .prepare(`SELECT decision FROM flow_run_approvals WHERE run_id = ?`)
      .bind('run_before')
      .first<{ decision: string }>()
    expect(expired?.decision).toBe('approved')
  })

  it('asks for remaining time from the deadline memoized at open after a replay', async () => {
    const db = createMemoryDb()
    const snap = seal(ORG)
    await insertQueued(db, {
      runId: 'run_replay',
      orgId: ORG,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    const cache = new Map<string, unknown>()
    const realNow = Date.now
    let now = 5_000_000_000
    Date.now = () => now
    let cut = false
    const step: DriveStep = async (name, fn) => {
      if (cache.has(name)) return cache.get(name) as never
      if (name === 'approve:clock:gate:1' && !cut) {
        cut = true
        throw new Error('cut before clock 1')
      }
      const value = await fn()
      cache.set(name, value)
      return value
    }
    const asked: Array<{ attempt: number; ms: number }> = []
    try {
      await expect(
        driveFlowRun({
          step,
          db,
          invoke: async () => ({ output: 'no' }),
          awaitApproval: async (_taskId, timeoutMs, attempt) => {
            asked.push({ attempt, ms: timeoutMs })
            now += 60_000
            return 'timeout'
          },
          payload: { runId: 'run_replay', orgId: ORG },
          instanceId: 'wfinst_approve',
        }),
      ).rejects.toThrow('cut before clock 1')
      const deadline = (cache.get('approve:open:gate') as { deadlineMs: number }).deadlineMs
      await expect(
        driveFlowRun({
          step,
          db,
          invoke: async () => ({ output: 'no' }),
          awaitApproval: async (_taskId, timeoutMs, attempt) => {
            asked.push({ attempt, ms: timeoutMs })
            if (attempt === 1) {
              const clock = cache.get('approve:clock:gate:1') as number
              expect(timeoutMs).toBe(deadline - clock)
              now += 48 * 60 * 60 * 1000
            }
            return 'timeout'
          },
          payload: { runId: 'run_replay', orgId: ORG },
          instanceId: 'wfinst_approve',
        }),
      ).rejects.toThrow(/APPROVAL_TIMEOUT/)
    } finally {
      Date.now = realNow
    }
    expect(asked.some((call) => call.attempt === 1)).toBe(true)
  })

  it('keeps a user approval inserted after the last loop read and before expire', async () => {
    const db = createMemoryDb()
    const snap = seal(ORG)
    await insertQueued(db, {
      runId: 'run_late_read',
      orgId: ORG,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    const step: DriveStep = async (name, fn) => {
      if (name.startsWith('approve:read:') && !name.endsWith(':final')) return null as never
      return fn()
    }
    let invokes = 0
    await driveFlowRun({
      step,
      db,
      invoke: async () => {
        invokes += 1
        return { output: 'kept' }
      },
      awaitApproval: async () => {
        await insertApproval(db, {
          id: 'appr_late_read',
          orgId: ORG,
          runId: 'run_late_read',
          taskId: 'gate',
          decision: 'approved',
          by: 'user_staff',
        }).catch(() => undefined)
        return 'timeout'
      },
      payload: { runId: 'run_late_read', orgId: ORG },
      instanceId: 'wfinst_approve',
    })
    const row = await load(db, 'run_late_read', ORG)
    expect(row?.status).toBe('succeeded')
    expect(tasksOf(row).gate?.approval?.by).toBe('user_staff')
    expect(invokes).toBe(1)
  })

  it('expires after one wait when the clock jumps past the deadline', async () => {
    const db = createMemoryDb()
    const snap = seal(ORG)
    await insertQueued(db, {
      runId: 'run_jump',
      orgId: ORG,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    const realNow = Date.now
    let now = realNow()
    Date.now = () => now
    let waits = 0
    try {
      await expect(
        driveFlowRun({
          step: immediateStep,
          db,
          invoke: async () => ({ output: 'no' }),
          awaitApproval: async () => {
            waits += 1
            now += 48 * 60 * 60 * 1000
            return 'timeout'
          },
          payload: { runId: 'run_jump', orgId: ORG },
          instanceId: 'wfinst_approve',
        }),
      ).rejects.toThrow(/APPROVAL_TIMEOUT/)
    } finally {
      Date.now = realNow
    }
    expect(waits).toBe(1)
  })

  it('retries idempotent approve steps and not open or resolve', async () => {
    const db = createMemoryDb()
    const snap = seal(ORG)
    await insertQueued(db, {
      runId: 'run_retry',
      orgId: ORG,
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    const configs = new Map<string, unknown>()
    const step: DriveStep = async (name, fn, config) => {
      configs.set(name, config)
      return fn()
    }
    await driveFlowRun({
      step,
      db,
      invoke: async () => ({ output: 'ok' }),
      awaitApproval: async () => {
        await insertApproval(db, {
          id: 'appr_retry',
          orgId: ORG,
          runId: 'run_retry',
          taskId: 'gate',
          decision: 'approved',
          by: 'user_staff',
        })
        return 'event'
      },
      payload: { runId: 'run_retry', orgId: ORG },
      instanceId: 'wfinst_approve',
    })
    expect(configs.get('approve:open:gate')).toEqual({ retries: { limit: 0 } })
    expect(configs.get('approve:resolve:gate')).toEqual({ retries: { limit: 0 } })
    expect(configs.get('approve:read:gate:0')).toEqual({ retries: { limit: 3 } })
    expect(configs.get('approve:clock:gate:0')).toEqual({ retries: { limit: 3 } })
  })
})
