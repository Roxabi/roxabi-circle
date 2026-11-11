import {
  createRunSnapshot,
  createToolRegistry,
  flowApprovalEventType,
  loadPlanFromYaml,
  mintCapabilityGrant,
} from '@kit/flows'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryEnv } from '../test/memory-env'
import { FlowRunWorkflow } from './workflow'

const YAML = `flows: v0
plan:
  id: approve-shell
permits:
  tools:
    - echo
tasks:
  gate:
    approve:
      timeout_hours: 2
  echo_hello:
    after:
      - gate
    invoke:
      tool: echo
`

async function seed(env: ReturnType<typeof createMemoryEnv>) {
  const registry = createToolRegistry('example-api-drive-v0', [
    { name: 'echo', description: 'Echo args (kit dogfood)', grantClass: 'mintable' },
  ])
  const minted = mintCapabilityGrant({
    orgId: 'org_a',
    registry,
    facts: { moduleEffective: true, canRead: true, canWrite: true, allowedModels: [] },
  })
  if (!minted.ok) throw new Error(minted.message)
  const snap = createRunSnapshot({
    plan: loadPlanFromYaml(YAML),
    grant: minted.grant,
    registry,
    actorId: 'actor_1',
  })
  if (!snap.ok) throw new Error(snap.issues.map((i) => i.code).join(','))
  const now = Date.now()
  await env.DB.prepare(
    `INSERT INTO flow_plans (id, org_id, plan_key, version, enabled, plan_json, plan_digest, created_at, updated_at)
     VALUES (?, ?, ?, 1, 1, '{}', ?, ?, ?)`,
  )
    .bind('plan_shell', 'org_a', 'approve-shell', snap.runnerView.planDigest, now, now)
    .run()
  await env.DB.prepare(
    `INSERT INTO flow_runs (
      id, org_id, plan_id, plan_key, status, actor_id, snapshot_json, plan_digest, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)`,
  )
    .bind(
      'run_shell',
      'org_a',
      'plan_shell',
      'approve-shell',
      'actor_1',
      JSON.stringify(snap.runnerView),
      snap.runnerView.planDigest,
      now,
      now,
    )
    .run()
}

describe('FlowRunWorkflow approval wake', () => {
  it('does not continue on a forged payload with no decision row', async () => {
    const env = createMemoryEnv()
    await seed(env)
    const waits: Array<{ name: string; type: string }> = []
    const expected = await flowApprovalEventType('gate')
    const step = {
      async do(_name: string, fnOrConfig: unknown, maybeFn?: unknown) {
        const fn = typeof fnOrConfig === 'function' ? fnOrConfig : maybeFn
        return await (fn as () => Promise<unknown>)()
      },
      async waitForEvent(name: string, options: { type: string; timeout?: number }) {
        waits.push({ name, type: options.type })
        return { type: options.type, payload: { forged: true } }
      },
    }
    const wf = new FlowRunWorkflow({} as never, env as never)
    await expect(
      wf.run(
        {
          payload: { runId: 'run_shell', orgId: 'org_a' },
          instanceId: 'run_shell',
          timestamp: new Date(),
        } as never,
        step as never,
      ),
    ).rejects.toMatchObject({ message: 'APPROVAL_TIMEOUT' })
    expect(waits.length).toBe(8)
    expect(waits[0]).toEqual({ name: 'approval:gate:0', type: expected })
    const row = await env.DB.prepare(
      `SELECT status, error_code, receipt_json FROM flow_runs WHERE id = ?`,
    )
      .bind('run_shell')
      .first<{ status: string; error_code: string; receipt_json: string }>()
    expect(row?.status).toBe('failed')
    expect(row?.error_code).toBe('APPROVAL_TIMEOUT')
    expect(row?.receipt_json).not.toContain('forged')
    expect(JSON.parse(row?.receipt_json ?? '{}').tasks.echo_hello.outcome).toBe('skip')
  })

  it('stamps the user row inserted outside the event', async () => {
    const env = createMemoryEnv()
    await seed(env)
    await env.DB.prepare(`UPDATE flow_runs SET receipt_json = ? WHERE id = ?`)
      .bind(
        JSON.stringify({
          receiptVersion: 1,
          tokensUsed: 0,
          tasks: { gate: { taskId: 'gate', outcome: 'waiting' } },
        }),
        'run_shell',
      )
      .run()
    await env.DB.prepare(
      `INSERT INTO flow_run_approvals (id, org_id, run_id, task_id, decision, decided_by, decided_at)
       VALUES ('appr_shell', 'org_a', 'run_shell', 'gate', 'approved', 'user_staff', ?)`,
    )
      .bind(1_700_000_000_000)
      .run()
    let waits = 0
    const step = {
      async do(_name: string, fnOrConfig: unknown, maybeFn?: unknown) {
        const fn = typeof fnOrConfig === 'function' ? fnOrConfig : maybeFn
        return await (fn as () => Promise<unknown>)()
      },
      async waitForEvent() {
        waits += 1
        return { payload: { forged: true } }
      },
    }
    const wf = new FlowRunWorkflow({} as never, env as never)
    await wf.run(
      {
        payload: { runId: 'run_shell', orgId: 'org_a' },
        instanceId: 'run_shell',
        timestamp: new Date(),
      } as never,
      step as never,
    )
    expect(waits).toBe(0)
    const row = await env.DB.prepare(`SELECT receipt_json FROM flow_runs WHERE id = ?`)
      .bind('run_shell')
      .first<{ receipt_json: string }>()
    const tasks = JSON.parse(row?.receipt_json ?? '{}').tasks
    expect(tasks.gate.approval).toEqual({
      by: 'user_staff',
      at: new Date(1_700_000_000_000).toISOString(),
    })
    expect(row?.receipt_json).not.toContain('forged')
  })

  it('maps a throwing waitForEvent to the timeout path', async () => {
    const env = createMemoryEnv()
    await seed(env)
    let waits = 0
    let now = Date.now()
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now)
    try {
      const step = {
        async do(_name: string, fnOrConfig: unknown, maybeFn?: unknown) {
          const fn = typeof fnOrConfig === 'function' ? fnOrConfig : maybeFn
          return await (fn as () => Promise<unknown>)()
        },
        async waitForEvent() {
          waits += 1
          now += 48 * 60 * 60 * 1000
          throw new Error('workflow timeout')
        },
      }
      const wf = new FlowRunWorkflow({} as never, env as never)
      await expect(
        wf.run(
          {
            payload: { runId: 'run_shell', orgId: 'org_a' },
            instanceId: 'run_shell',
            timestamp: new Date(),
          } as never,
          step as never,
        ),
      ).rejects.toMatchObject({ message: 'APPROVAL_TIMEOUT' })
      expect(waits).toBe(1)
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('records different wait types for two approve tasks and ignores a forged payload once a row exists', async () => {
    const env = createMemoryEnv()
    const registry = createToolRegistry('example-api-drive-v0', [
      { name: 'echo', description: 'Echo args (kit dogfood)', grantClass: 'mintable' },
    ])
    const minted = mintCapabilityGrant({
      orgId: 'org_a',
      registry,
      facts: { moduleEffective: true, canRead: true, canWrite: true, allowedModels: [] },
    })
    if (!minted.ok) throw new Error(minted.message)
    const plan = loadPlanFromYaml(`flows: v0
plan:
  id: two-gates
permits:
  tools:
    - echo
tasks:
  gate:
    approve: {}
  gate2:
    after:
      - gate
    approve: {}
  echo_hello:
    after:
      - gate2
    invoke:
      tool: echo
`)
    const snap = createRunSnapshot({
      plan,
      grant: minted.grant,
      registry,
      actorId: 'actor_1',
    })
    if (!snap.ok) throw new Error(snap.issues.map((i) => i.code).join(','))
    const now = Date.now()
    await env.DB.prepare(
      `INSERT INTO flow_plans (id, org_id, plan_key, version, enabled, plan_json, plan_digest, created_at, updated_at)
       VALUES ('plan_two', 'org_a', 'two-gates', 1, 1, '{}', ?, ?, ?)`,
    )
      .bind(snap.runnerView.planDigest, now, now)
      .run()
    await env.DB.prepare(
      `INSERT INTO flow_runs (
        id, org_id, plan_id, plan_key, status, actor_id, snapshot_json, plan_digest, created_at, updated_at
      ) VALUES ('run_two', 'org_a', 'plan_two', 'two-gates', 'queued', 'actor_1', ?, ?, ?, ?)`,
    )
      .bind(JSON.stringify(snap.runnerView), snap.runnerView.planDigest, now, now)
      .run()
    const types: string[] = []
    const step = {
      async do(_name: string, fnOrConfig: unknown, maybeFn?: unknown) {
        const fn = typeof fnOrConfig === 'function' ? fnOrConfig : maybeFn
        return await (fn as () => Promise<unknown>)()
      },
      async waitForEvent(_name: string, options: { type: string }) {
        types.push(options.type)
        await env.DB.prepare(
          `INSERT INTO flow_run_approvals (id, org_id, run_id, task_id, decision, decided_by, decided_at)
           VALUES (?, 'org_a', 'run_two', ?, 'approved', 'user_staff', 1700000000000)`,
        )
          .bind(`appr_${types.length}`, types.length === 1 ? 'gate' : 'gate2')
          .run()
        return { type: options.type, payload: { forged: true, by: 'forged' } }
      },
    }
    const wf = new FlowRunWorkflow({} as never, env as never)
    await wf.run(
      {
        payload: { runId: 'run_two', orgId: 'org_a' },
        instanceId: 'run_two',
        timestamp: new Date(),
      } as never,
      step as never,
    )
    expect(types.length).toBeGreaterThanOrEqual(2)
    expect(types[0]).not.toBe(types[1])
    expect(types[0]).toBe(await flowApprovalEventType('gate'))
    expect(types[1]).toBe(await flowApprovalEventType('gate2'))
    const row = await env.DB.prepare(
      `SELECT receipt_json FROM flow_runs WHERE id = 'run_two'`,
    ).first<{
      receipt_json: string
    }>()
    const tasks = JSON.parse(row?.receipt_json ?? '{}').tasks
    expect(tasks.gate.approval.by).toBe('user_staff')
    expect(tasks.gate2.approval.by).toBe('user_staff')
    expect(row?.receipt_json).not.toContain('forged')
  })
})
