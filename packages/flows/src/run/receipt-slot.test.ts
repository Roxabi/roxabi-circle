import { describe, expect, it } from 'vitest'
import { INVOKE_ONLY_PLAN_YAML } from './fixtures'
import { runInferStep } from './infer-step'
import { runInvokeStep } from './invoke-step'
import { persistBundle } from './persist'
import type { DriveStep } from './step-io'
import { createMemoryDb } from './test/memory-db'
import { SEED_ORG, seedRun, stepIo, taskReceipts } from './test/seed-run'

const immediate: DriveStep = async (_name, fn) => fn()

const INFER_PLAN_YAML = `flows: v0
plan:
  id: one-infer
  model: kit-infer
  max_tokens: 100
permits:
  tools:
    - echo
tasks:
  infer_a:
    infer:
      prompt: "one"
      max_tokens: 40
`

describe('effect step task slot', () => {
  it.each([
    ['ok', { outcome: 'ok', output: 'first' }],
    ['fail', { outcome: 'fail', errorCode: 'INVOKE_FAILED' }],
  ])('invoke re-entry on a %s receipt calls the port 0 times and keeps it', async (_n, rec) => {
    const db = createMemoryDb()
    const view = await seedRun(db, {
      runId: 'run_done',
      planYaml: INVOKE_ONLY_PLAN_YAML,
      status: 'running',
      tasks: { echo_hello: rec },
    })
    let calls = 0
    await runInvokeStep({
      step: immediate,
      invoke: async () => {
        calls += 1
        return { output: 'second' }
      },
      view,
      taskId: 'echo_hello',
      tool: 'echo',
      io: stepIo(db, 'run_done', ['echo_hello']),
    })
    expect(calls).toBe(0)
    expect((await taskReceipts(db, 'run_done')).tasks.echo_hello).toEqual({
      taskId: 'echo_hello',
      ...rec,
    })
  })

  it('infer re-entry on an ok receipt calls the port 0 times and keeps tokens', async () => {
    const db = createMemoryDb()
    const view = await seedRun(db, {
      runId: 'run_infer_done',
      planYaml: INFER_PLAN_YAML,
      status: 'running',
      canWrite: true,
      tokensUsed: 7,
      tasks: { infer_a: { outcome: 'ok', output: 'first' } },
    })
    let calls = 0
    await runInferStep({
      step: immediate,
      infer: async () => {
        calls += 1
        return { text: 'second', tokens: 7 }
      },
      view,
      taskId: 'infer_a',
      body: { prompt: 'one', max_tokens: 40 },
      io: stepIo(db, 'run_infer_done', ['infer_a']),
    })
    expect(calls).toBe(0)
    const after = await taskReceipts(db, 'run_infer_done')
    expect(after.tasks.infer_a).toMatchObject({ outcome: 'ok', output: 'first' })
    expect(after.tokensUsed).toBe(7)
  })

  it('infer writes started before its port on first entry', async () => {
    const db = createMemoryDb()
    const view = await seedRun(db, {
      runId: 'run_infer_first',
      planYaml: INFER_PLAN_YAML,
      status: 'running',
      canWrite: true,
    })
    let seen: string | undefined
    await runInferStep({
      step: immediate,
      infer: async () => {
        seen = (await taskReceipts(db, 'run_infer_first')).tasks.infer_a?.outcome
        return { text: 'n', tokens: 1 }
      },
      view,
      taskId: 'infer_a',
      body: { prompt: 'one', max_tokens: 40 },
      io: stepIo(db, 'run_infer_first', ['infer_a']),
    })
    expect(seen).toBe('started')
    expect((await taskReceipts(db, 'run_infer_first')).tasks.infer_a?.outcome).toBe('ok')
  })

  it('closes started on a queued run as RECEIPT_LOST with 0 port calls', async () => {
    const db = createMemoryDb()
    const view = await seedRun(db, {
      runId: 'run_queued',
      planYaml: INVOKE_ONLY_PLAN_YAML,
      status: 'queued',
      tasks: { echo_hello: { outcome: 'started' } },
    })
    let calls = 0
    await runInvokeStep({
      step: immediate,
      invoke: async () => {
        calls += 1
        return {}
      },
      view,
      taskId: 'echo_hello',
      tool: 'echo',
      io: stepIo(db, 'run_queued', ['echo_hello']),
    })
    expect(calls).toBe(0)
    expect((await taskReceipts(db, 'run_queued')).tasks.echo_hello).toMatchObject({
      outcome: 'fail',
      errorCode: 'RECEIPT_LOST',
    })
  })

  it('a started write under a foreign orgId changes 0 rows and leaves the victim unchanged', async () => {
    const db = createMemoryDb()
    await seedRun(db, {
      runId: 'run_victim',
      planYaml: INVOKE_ONLY_PLAN_YAML,
      status: 'running',
      tasks: { echo_hello: { outcome: 'ok', output: 'mine' } },
    })
    const changes = await persistBundle(db, {
      runId: 'run_victim',
      orgId: 'org_other',
      status: 'running',
      receiptJson: JSON.stringify({
        receiptVersion: 1,
        tokensUsed: 0,
        tasks: { echo_hello: { taskId: 'echo_hello', outcome: 'started' } },
      }),
    })
    expect(changes).toBe(0)
    const victim = await taskReceipts(db, 'run_victim', SEED_ORG)
    expect(victim.tasks.echo_hello).toMatchObject({ outcome: 'ok', output: 'mine' })
  })
})
