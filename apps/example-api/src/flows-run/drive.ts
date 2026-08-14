/** Snapshot-only driver. Dispatch is interpret.readyTaskIds only. */

import {
  interpretRun,
  parseReceipts,
  parseRunnerView,
  type ReceiptBundle,
  type RunnerView,
  type TaskReceipt,
} from '@kit/flows'
import { z } from 'zod'
import { runInferStep } from './infer-step'
import { claimRun, loadRun, persistBundle } from './persist'

const OUTPUT_MAX = 4096

const paramsSchema = z
  .object({
    runId: z.string().min(1).max(100),
    orgId: z.string().min(1).max(256),
  })
  .strict()

const idsOnlySchema = z.object({ runId: z.string().min(1), orgId: z.string().min(1) })

export class DriveNonRetryableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DriveNonRetryableError'
  }
}

export type DriveStep = <T>(
  name: string,
  fn: () => Promise<T>,
  config?: { retries?: { limit: number } },
) => Promise<T>

export type InvokePort = (task: {
  taskId: string
  tool: string
  args?: Record<string, unknown>
}) => Promise<{ output?: string }>

export type InferPort = (task: {
  taskId: string
  prompt: string
  max_tokens?: number
  model?: string
}) => Promise<{ text: string; tokens: number }>

type PersistFn = typeof persistBundle

const noRetry = { retries: { limit: 0 } } as const

function emptyBundle(): ReceiptBundle {
  return { receiptVersion: 1, tokensUsed: 0, tasks: {} }
}

function truncateOutput(value: string | undefined): string | undefined {
  return value !== undefined && value.length > OUTPUT_MAX ? value.slice(0, OUTPUT_MAX) : value
}

function parseSnapshot(raw: string) {
  try {
    return parseRunnerView(JSON.parse(raw) as unknown)
  } catch {
    return {
      ok: false as const,
      issues: [{ code: 'RUNNER_VIEW_INVALID', message: 'snapshot_json is not JSON' }],
    }
  }
}

function receiptsFromRow(raw: string | null, taskIds: readonly string[]): ReceiptBundle | null {
  if (raw == null || raw === '') return emptyBundle()
  try {
    const parsed = parseReceipts(JSON.parse(raw) as unknown, taskIds)
    return parsed.ok ? parsed.receipts : null
  } catch {
    return null
  }
}

function withTask(bundle: ReceiptBundle, rec: TaskReceipt): ReceiptBundle {
  return {
    receiptVersion: 1,
    tokensUsed: bundle.tokensUsed,
    tasks: { ...bundle.tasks, [rec.taskId]: rec },
  }
}

async function writeBundle(
  step: DriveStep,
  persist: PersistFn,
  db: D1Database,
  name: string,
  input: {
    runId: string
    orgId: string
    status: string
    bundle: ReceiptBundle
    errorCode?: string | null
  },
): Promise<void> {
  await step(name, async () => {
    try {
      await persist(db, {
        runId: input.runId,
        orgId: input.orgId,
        status: input.status,
        receiptJson: JSON.stringify(input.bundle),
        errorCode: input.errorCode,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'persist failed'
      throw new DriveNonRetryableError(message)
    }
  })
}

async function failClosed(
  step: DriveStep,
  persist: PersistFn,
  db: D1Database,
  name: string,
  ids: { runId: string; orgId: string },
  errorCode: string,
  bundle: ReceiptBundle = emptyBundle(),
): Promise<never> {
  await writeBundle(step, persist, db, name, {
    ...ids,
    status: 'failed',
    bundle,
    errorCode,
  })
  throw new DriveNonRetryableError(errorCode)
}

type InvokeResult = { outcome: 'ok'; output?: string } | { outcome: 'fail'; errorCode: string }

async function runInvoke(
  step: DriveStep,
  invoke: InvokePort,
  view: RunnerView,
  taskId: string,
  tool: string,
  args?: Record<string, unknown>,
): Promise<TaskReceipt> {
  const result = await step(
    `invoke:${taskId}`,
    async (): Promise<InvokeResult> => {
      try {
        if (!view.executionTools.includes(tool)) {
          return { outcome: 'fail', errorCode: 'TOOL_NOT_IN_EXECUTION_TOOLS' }
        }
        const out = await invoke({ taskId, tool, args })
        return { outcome: 'ok', output: truncateOutput(out.output) }
      } catch {
        return { outcome: 'fail', errorCode: 'INVOKE_FAILED' }
      }
    },
    noRetry,
  )
  return result.outcome === 'ok'
    ? { taskId, outcome: 'ok', output: result.output }
    : { taskId, outcome: 'fail', errorCode: result.errorCode }
}

export async function driveFlowRun(input: {
  step: DriveStep
  db: D1Database
  invoke: InvokePort
  infer?: InferPort
  interpret?: typeof interpretRun
  persistBundle?: typeof persistBundle
  payload: unknown
  instanceId: string
}): Promise<void> {
  const { step, db, invoke, infer, instanceId } = input
  const persist = input.persistBundle ?? persistBundle
  const interpret = input.interpret ?? interpretRun

  const parsed = paramsSchema.safeParse(input.payload)
  if (!parsed.success) {
    const ids = idsOnlySchema.safeParse(input.payload)
    if (ids.success) {
      await writeBundle(step, persist, db, 'persist:invalid-params', {
        ...ids.data,
        status: 'failed',
        bundle: emptyBundle(),
      })
    }
    throw new DriveNonRetryableError('invalid payload')
  }
  const { runId, orgId } = parsed.data
  const ids = { runId, orgId }

  await step('claim', async () => {
    const changes = await claimRun(db, { runId, orgId, instanceId })
    if (changes === 0) throw new DriveNonRetryableError('claim lost')
  })

  const row = await step('load', () => loadRun(db, runId, orgId))
  if (!row) throw new DriveNonRetryableError('run not found')

  const viewParsed = parseSnapshot(row.snapshot_json)
  if (!viewParsed.ok) {
    return await failClosed(step, persist, db, 'persist:invalid-view', ids, 'RUNNER_VIEW_INVALID')
  }
  const view = viewParsed.runnerView
  if (view.orgId !== orgId || view.orgId !== row.org_id) {
    return await failClosed(step, persist, db, 'persist:org-mismatch', ids, 'ORG_MISMATCH')
  }

  const taskIds = Object.keys(view.sealedPlan.tasks)
  let wave = 0
  for (;;) {
    const current = wave === 0 ? row : await step(`load:${wave}`, () => loadRun(db, runId, orgId))
    if (!current) throw new DriveNonRetryableError('run not found')

    const receipts = receiptsFromRow(current.receipt_json, taskIds)
    if (!receipts) {
      return await failClosed(
        step,
        persist,
        db,
        'persist:invalid-receipts',
        ids,
        'RECEIPTS_INVALID',
      )
    }

    const result = interpret(view, receipts)
    if (result.readyTaskIds.length === 0) {
      const status = result.rollup === 'succeeded' ? 'succeeded' : 'failed'
      const errorCode = result.stuck ?? null
      await writeBundle(step, persist, db, 'persist:rollup', {
        ...ids,
        status,
        bundle: result.receipts,
        errorCode,
      })
      if (result.rollup === 'succeeded') return
      throw new DriveNonRetryableError(errorCode ?? 'failed')
    }

    let bundle = result.receipts
    for (const taskId of result.readyTaskIds) {
      const task = view.sealedPlan.tasks[taskId]
      let rec: TaskReceipt
      if (task?.invoke) {
        rec = await runInvoke(step, invoke, view, taskId, task.invoke.tool, task.invoke.args)
      } else if (task?.infer) {
        // TOKEN_CEILING / INFER_FAILED decided in infer-step
        const inferred = await runInferStep({
          step,
          infer,
          view,
          taskId,
          body: task.infer,
          tokensUsed: bundle.tokensUsed,
        })
        rec = inferred.rec
        bundle = { ...bundle, tokensUsed: inferred.tokensUsed }
      } else {
        rec = { taskId, outcome: 'fail', errorCode: 'INVOKE_FAILED' }
      }
      bundle = withTask(bundle, rec)
      await writeBundle(step, persist, db, `persist:${taskId}`, {
        ...ids,
        status: 'running',
        bundle,
        errorCode: null,
      })
    }
    wave += 1
  }
}
