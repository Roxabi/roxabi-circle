import { describe, expect, it } from 'vitest'
import { createRunSnapshot, createToolRegistry, loadPlanFromYaml, mintCapabilityGrant } from '..'
import { DriveNonRetryableError, type DriveStep, driveFlowRun } from './drive'
import {
  INVOKE_ONLY_PLAN_YAML,
  MIXED_EFFECT_INVOKE_PLAN_YAML,
  TWO_SIBLING_INVOKE_PLAN_YAML,
} from './fixtures'
import { createMemoryDb } from './test/memory-db'

type RunRow = {
  status: string
  error_code: string | null
  receipt_json: string | null
  workflow_instance_id: string | null
}

const immediateStep: DriveStep = async (_name, fn) => fn()

const registry = createToolRegistry('example-api-drive-v0', [
  { name: 'echo', description: 'Echo args (kit dogfood)', grantClass: 'mintable' },
])

const INSTANCE_ID = 'wfinst_drive_v1'

// createRunSnapshot seals only a kit-minted grant, so the fixture mints instead of hand-writing it.
function mintFixtureGrant(orgId: string, canWrite = false) {
  const minted = mintCapabilityGrant({
    orgId,
    registry,
    facts: { moduleEffective: true, canRead: true, canWrite, allowedModels: [] },
  })
  if (!minted.ok) throw new Error(`fixture grant must mint: ${minted.message}`)
  return minted.grant
}

function seal(orgId: string) {
  const plan = loadPlanFromYaml(INVOKE_ONLY_PLAN_YAML)
  const result = createRunSnapshot({
    plan,
    grant: mintFixtureGrant(orgId),
    registry,
    actorId: 'actor_1',
  })
  if (!result.ok) {
    throw new Error(`fixture snapshot failed: ${result.issues.map((i) => i.code).join(',')}`)
  }
  return result
}

function makePorts() {
  let invokeCount = 0
  let inferCount = 0
  return {
    get invokeCount() {
      return invokeCount
    },
    get inferCount() {
      return inferCount
    },
    invoke: async () => {
      invokeCount += 1
      return { output: 'echo' }
    },
    infer: async () => {
      inferCount += 1
      return { text: 'n', tokens: 1 }
    },
  }
}

async function insertQueued(
  db: ReturnType<typeof createMemoryDb>,
  opts: {
    runId: string
    orgId: string
    snapshotJson: string
    planDigest: string
    enabled?: number
    planJson?: string
  },
) {
  const now = Date.now()
  await db
    .prepare(
      `INSERT INTO flow_plans (id, org_id, plan_key, version, enabled, plan_json, plan_digest, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    )
    .bind(
      `plan_${opts.runId}`,
      opts.orgId,
      'echo-only',
      opts.enabled ?? 1,
      opts.planJson ?? '{}',
      opts.planDigest,
      now,
      now,
    )
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

async function loadRun(db: ReturnType<typeof createMemoryDb>, runId: string, orgId: string) {
  return (await db
    .prepare(
      `SELECT status, error_code, receipt_json, workflow_instance_id FROM flow_runs WHERE id = ? AND org_id = ?`,
    )
    .bind(runId, orgId)
    .first()) as RunRow | null
}

// Call sites pass `row?.receipt_json`, so the row itself may be missing.
function receiptTasks(receiptJson: string | null | undefined) {
  return (
    JSON.parse(receiptJson as string) as {
      tasks?: Record<string, { outcome?: string; output?: string }>
    }
  ).tasks
}

async function driveSealed(runId: string, extra?: { enabled?: number; planJson?: string }) {
  const db = createMemoryDb()
  const snap = seal('org_a')
  await insertQueued(db, {
    runId,
    orgId: 'org_a',
    snapshotJson: JSON.stringify(snap.runnerView),
    planDigest: snap.runnerView.planDigest,
    enabled: extra?.enabled,
    planJson: extra?.planJson,
  })
  const ports = makePorts()
  await driveFlowRun({
    step: immediateStep,
    db,
    invoke: ports.invoke,
    infer: ports.infer,
    payload: { runId, orgId: 'org_a' },
    instanceId: INSTANCE_ID,
  })
  return { snap, ports, row: await loadRun(db, runId, 'org_a') }
}

describe('driveFlowRun success', () => {
  it('writes echo_hello outcome ok and status succeeded for invoke-only fixture', async () => {
    const { snap, ports, row } = await driveSealed('run_ok')
    expect('grantAudit' in snap.runnerView).toBe(false)
    expect(row).toBeTruthy()
    expect(row?.status).toBe('succeeded')
    expect(row?.workflow_instance_id).toBe(INSTANCE_ID)
    expect(receiptTasks(row?.receipt_json)?.echo_hello?.outcome).toBe('ok')
    expect(ports.invokeCount).toBe(1)
    expect(ports.inferCount).toBe(0)
  })

  it('ignores enabled=false on the plan row and still succeeds the snapshot', async () => {
    const { row, ports } = await driveSealed('run_disabled', { enabled: 0 })
    expect(row?.status).toBe('succeeded')
    expect(receiptTasks(row?.receipt_json)?.echo_hello?.outcome).toBe('ok')
    expect(ports.invokeCount).toBe(1)
  })

  it('ignores live plan_json edits and does not record a mutated task', async () => {
    const { row, ports } = await driveSealed('run_live_edit', {
      planJson: JSON.stringify({
        tasks: { mutated: { invoke: { tool: 'echo', args: { text: 'live' } } } },
      }),
    })
    const tasks = receiptTasks(row?.receipt_json)
    expect(row?.status).toBe('succeeded')
    expect(tasks?.echo_hello?.outcome).toBe('ok')
    expect(tasks).not.toHaveProperty('mutated')
    expect(ports.invokeCount).toBe(1)
  })

  it('keeps both sibling invoke outputs after persist:terminal', async () => {
    const db = createMemoryDb()
    const plan = loadPlanFromYaml(TWO_SIBLING_INVOKE_PLAN_YAML)
    const snap = createRunSnapshot({
      plan,
      grant: mintFixtureGrant('org_a'),
      registry,
      actorId: 'actor_1',
    })
    if (!snap.ok) {
      throw new Error(`sibling snapshot failed: ${snap.issues.map((i) => i.code).join(',')}`)
    }
    await insertQueued(db, {
      runId: 'run_siblings',
      orgId: 'org_a',
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    let invokeCount = 0
    const names: string[] = []
    const stepReturns: Record<string, unknown> = {}
    const recordingStep: DriveStep = async (name, fn) => {
      names.push(name)
      const value = await fn()
      stepReturns[name] = value
      return value
    }
    await driveFlowRun({
      step: recordingStep,
      db,
      invoke: async (task) => {
        invokeCount += 1
        return { output: String(task.args?.text ?? '') }
      },
      payload: { runId: 'run_siblings', orgId: 'org_a' },
      instanceId: INSTANCE_ID,
    })
    const row = await loadRun(db, 'run_siblings', 'org_a')
    const tasks = receiptTasks(row?.receipt_json ?? null)
    expect(invokeCount).toBe(2)
    expect(row?.status).toBe('succeeded')
    expect(tasks?.echo_a?.outcome).toBe('ok')
    expect(tasks?.echo_b?.outcome).toBe('ok')
    expect(tasks?.echo_a?.output).toBe('alpha')
    expect(tasks?.echo_b?.output).toBe('beta')

    expect(names.filter((n) => n === 'load' || n.startsWith('load:'))).toEqual(['load', 'load:1'])
    const invokeReturns = JSON.stringify(
      names.filter((n) => n.startsWith('invoke:')).map((n) => stepReturns[n]),
    )
    expect(invokeReturns).not.toContain('alpha')
    expect(invokeReturns).not.toContain('beta')
  })
})

describe('driveFlowRun invoke retries from sealed toolEffects (Roxabi/roxabi-boilerplate-cf#234)', () => {
  /** CF-shaped step: re-run fn on throw up to retries.limit; NonRetryable aborts immediately. */
  async function attemptWithRetries<T>(
    fn: () => Promise<T>,
    config: { retries?: { limit?: number } } | undefined,
  ): Promise<T> {
    const limit = config?.retries?.limit ?? 0
    let last: unknown
    for (let attempt = 0; attempt <= limit; attempt++) {
      try {
        return await fn()
      } catch (err) {
        last = err
        if (err instanceof DriveNonRetryableError || attempt === limit) throw err
      }
    }
    throw last
  }

  function retryingStep(): DriveStep {
    return async (_name, fn, config) => attemptWithRetries(fn, config)
  }

  async function sealWithRegistry(
    toolDefs: Parameters<typeof createToolRegistry>[1],
    planYaml: string = INVOKE_ONLY_PLAN_YAML,
  ) {
    const reg = createToolRegistry('example-api-drive-v0', toolDefs)
    const minted = mintCapabilityGrant({
      orgId: 'org_a',
      registry: reg,
      facts: { moduleEffective: true, canRead: true, canWrite: false, allowedModels: [] },
    })
    if (!minted.ok) throw new Error(minted.message)
    const plan = loadPlanFromYaml(planYaml)
    const snap = createRunSnapshot({
      plan,
      grant: minted.grant,
      registry: reg,
      actorId: 'actor_1',
    })
    if (!snap.ok) throw new Error(snap.issues.map((i) => i.code).join(','))
    return snap
  }

  async function driveWithRegistry(
    runId: string,
    toolDefs: Parameters<typeof createToolRegistry>[1],
    opts?: {
      planYaml?: string
      step?: DriveStep
      invoke?: (task: { taskId: string; tool: string; args?: Record<string, unknown> }) => Promise<{
        output?: string
      }>
      snapshotJson?: string
      planDigest?: string
    },
  ) {
    const snap = await sealWithRegistry(toolDefs, opts?.planYaml ?? INVOKE_ONLY_PLAN_YAML)
    const db = createMemoryDb()
    await insertQueued(db, {
      runId,
      orgId: 'org_a',
      snapshotJson: opts?.snapshotJson ?? JSON.stringify(snap.runnerView),
      planDigest: opts?.planDigest ?? snap.runnerView.planDigest,
    })
    const configs = new Map<string, unknown>()
    const inner =
      opts?.step ??
      (async (_name, fn, config) => {
        configs.set(_name, config)
        return fn()
      })
    const step: DriveStep = async (name, fn, config) => {
      configs.set(name, config)
      return inner(name, fn, config)
    }
    await driveFlowRun({
      step,
      db,
      invoke: opts?.invoke ?? (async () => ({ output: 'ok' })),
      payload: { runId, orgId: 'org_a' },
      instanceId: INSTANCE_ID,
    })
    const row = await loadRun(db, runId, 'org_a')
    return { configs, snap, row }
  }

  it('sealed effect read → invoke retries limit 3', async () => {
    const { configs, snap } = await driveWithRegistry('run_retry_read', [
      { name: 'echo', grantClass: 'mintable', effect: 'read' },
    ])
    expect(snap.runnerView.toolEffects).toEqual({ echo: 'read' })
    expect(configs.get('invoke:echo_hello')).toEqual({ retries: { limit: 3 } })
  })

  it('sealed effect write → omit toolEffects map and invoke retries limit 0', async () => {
    const { configs, snap } = await driveWithRegistry('run_retry_write', [
      { name: 'echo', grantClass: 'mintable', effect: 'write' },
    ])
    expect(snap.runnerView.toolEffects).toBeUndefined()
    expect(configs.get('invoke:echo_hello')).toEqual({ retries: { limit: 0 } })
  })

  it('omitted effect → omit toolEffects map and invoke retries limit 0', async () => {
    const { configs, snap } = await driveWithRegistry('run_retry_absent', [
      { name: 'echo', grantClass: 'mintable' },
    ])
    expect(snap.runnerView.toolEffects).toBeUndefined()
    expect(configs.get('invoke:echo_hello')).toEqual({ retries: { limit: 0 } })
  })

  it('absent toolEffects on an old snapshot → invoke retries limit 0', async () => {
    const snap = seal('org_a')
    const { toolEffects: _drop, ...legacy } = snap.runnerView as typeof snap.runnerView & {
      toolEffects?: unknown
    }
    const db = createMemoryDb()
    await insertQueued(db, {
      runId: 'run_retry_legacy',
      orgId: 'org_a',
      snapshotJson: JSON.stringify(legacy),
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
      payload: { runId: 'run_retry_legacy', orgId: 'org_a' },
      instanceId: INSTANCE_ID,
    })
    expect(configs.get('invoke:echo_hello')).toEqual({ retries: { limit: 0 } })
  })

  it('present empty toolEffects map → invoke retries limit 0', async () => {
    const snap = await sealWithRegistry([{ name: 'echo', grantClass: 'mintable', effect: 'read' }])
    const wire = { ...JSON.parse(JSON.stringify(snap.runnerView)), toolEffects: {} }
    const { configs } = await driveWithRegistry(
      'run_retry_empty_map',
      [{ name: 'echo', grantClass: 'mintable', effect: 'read' }],
      { snapshotJson: JSON.stringify(wire), planDigest: snap.runnerView.planDigest },
    )
    expect(configs.get('invoke:echo_hello')).toEqual({ retries: { limit: 0 } })
  })

  it('mixed read+write plan → limit 3 vs 0 per invoke step', async () => {
    const { configs, snap } = await driveWithRegistry(
      'run_retry_mixed',
      [
        { name: 'echo_read', grantClass: 'mintable', effect: 'read' },
        { name: 'echo_write', grantClass: 'mintable', effect: 'write' },
      ],
      { planYaml: MIXED_EFFECT_INVOKE_PLAN_YAML },
    )
    expect(snap.runnerView.toolEffects).toEqual({ echo_read: 'read', echo_write: 'write' })
    expect(Object.keys(snap.runnerView.toolEffects ?? {}).sort()).toEqual(
      [...snap.runnerView.executionTools].sort(),
    )
    expect(configs.get('invoke:t_read')).toEqual({ retries: { limit: 3 } })
    expect(configs.get('invoke:t_write')).toEqual({ retries: { limit: 0 } })
  })

  it('toolEffects keyset equals executionTools when registry has never+read', async () => {
    const snap = await sealWithRegistry([
      { name: 'echo', grantClass: 'mintable', effect: 'write' },
      { name: 'ghost', grantClass: 'never', effect: 'read' },
    ])
    // all-write execution set omits the map; ghost is never so not in executionTools
    expect(snap.runnerView.executionTools).toEqual(['echo'])
    expect(snap.runnerView.toolEffects).toBeUndefined()

    const snapRead = await sealWithRegistry([
      { name: 'echo', grantClass: 'mintable', effect: 'read' },
      { name: 'ghost', grantClass: 'never', effect: 'read' },
    ])
    expect(snapRead.runnerView.executionTools).toEqual(['echo'])
    expect(snapRead.runnerView.toolEffects).toEqual({ echo: 'read' })
    expect(snapRead.runnerView.toolEffects).not.toHaveProperty('ghost')
  })

  it('sealed read: first port throw is retried, second succeeds', async () => {
    let calls = 0
    const { row } = await driveWithRegistry(
      'run_retry_throw_once',
      [{ name: 'echo', grantClass: 'mintable', effect: 'read' }],
      {
        step: retryingStep(),
        invoke: async () => {
          calls += 1
          if (calls === 1) throw new Error('transient')
          return { output: 'recovered' }
        },
      },
    )
    expect(calls).toBe(2)
    expect(row?.status).toBe('succeeded')
    expect(receiptTasks(row?.receipt_json)?.echo_hello?.outcome).toBe('ok')
    expect(receiptTasks(row?.receipt_json)?.echo_hello?.output).toBe('recovered')
  })

  it('sealed read: after retry limit writes INVOKE_FAILED', async () => {
    let calls = 0
    const snap = await sealWithRegistry([{ name: 'echo', grantClass: 'mintable', effect: 'read' }])
    const db = createMemoryDb()
    const runId = 'run_retry_exhausted'
    await insertQueued(db, {
      runId,
      orgId: 'org_a',
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    await expect(
      driveFlowRun({
        step: retryingStep(),
        db,
        invoke: async () => {
          calls += 1
          throw new Error('always-down')
        },
        payload: { runId, orgId: 'org_a' },
        instanceId: INSTANCE_ID,
      }),
    ).rejects.toBeInstanceOf(DriveNonRetryableError)
    expect(calls).toBe(4) // initial + limit 3
    const row = await loadRun(db, runId, 'org_a')
    expect(row?.status).toBe('failed')
    const tasks = JSON.parse(row?.receipt_json as string) as {
      tasks?: { echo_hello?: { outcome?: string; errorCode?: string } }
    }
    expect(tasks.tasks?.echo_hello?.outcome).toBe('fail')
    expect(tasks.tasks?.echo_hello?.errorCode).toBe('INVOKE_FAILED')
  })

  it('sealed write: port throw is not retried (single call → INVOKE_FAILED)', async () => {
    let calls = 0
    const snap = await sealWithRegistry([{ name: 'echo', grantClass: 'mintable', effect: 'write' }])
    const db = createMemoryDb()
    const runId = 'run_retry_write_once'
    await insertQueued(db, {
      runId,
      orgId: 'org_a',
      snapshotJson: JSON.stringify(snap.runnerView),
      planDigest: snap.runnerView.planDigest,
    })
    await expect(
      driveFlowRun({
        step: retryingStep(),
        db,
        invoke: async () => {
          calls += 1
          throw new Error('boom')
        },
        payload: { runId, orgId: 'org_a' },
        instanceId: INSTANCE_ID,
      }),
    ).rejects.toBeInstanceOf(DriveNonRetryableError)
    expect(calls).toBe(1)
    const row = await loadRun(db, runId, 'org_a')
    const tasks = JSON.parse(row?.receipt_json as string) as {
      tasks?: { echo_hello?: { errorCode?: string } }
    }
    expect(tasks.tasks?.echo_hello?.errorCode).toBe('INVOKE_FAILED')
  })
})
