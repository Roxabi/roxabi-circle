/** Snapshot-only driver. Dispatch is interpret.readyTaskIds only. */

import { z } from 'zod'
import { interpretRun } from '../interpret'
import { parseReceipts, type ReceiptBundle } from '../receipts'
import { parseRunnerView } from '../snapshot'
import { DriveNonRetryableError } from './errors'
import { runInferStep } from './infer-step'
import { runInvokeStep } from './invoke-step'
import { claimRun, loadRun, persistBundle } from './persist'

export { DriveNonRetryableError } from './errors'

const paramsSchema = z
  .object({
    runId: z.string().min(1).max(100),
    orgId: z.string().min(1).max(256),
  })
  .strict()

const instanceIdSchema = z.string().min(1).max(128)

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
  await step(
    name,
    async () => {
      const changes = await persist(db, {
        runId: input.runId,
        orgId: input.orgId,
        status: input.status,
        receiptJson: JSON.stringify(input.bundle),
        errorCode: input.errorCode,
      })
      if (changes !== 1) throw new DriveNonRetryableError('persist lost')
    },
    noRetry,
  )
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

export async function driveFlowRun(input: {
  step: DriveStep
  db: D1Database
  invoke: InvokePort
  infer?: InferPort
  hasTool?: (name: string) => boolean
  interpret?: typeof interpretRun
  persistBundle?: typeof persistBundle
  payload: unknown
  instanceId: string
}): Promise<void> {
  const { step, db, invoke, infer, hasTool, instanceId } = input
  const persist = input.persistBundle ?? persistBundle
  const interpret = input.interpret ?? interpretRun

  if (!instanceIdSchema.safeParse(instanceId).success) {
    throw new DriveNonRetryableError('invalid payload')
  }
  const parsed = paramsSchema.safeParse(input.payload)
  if (!parsed.success) throw new DriveNonRetryableError('invalid payload')
  const { runId, orgId } = parsed.data
  const ids = { runId, orgId }

  await step(
    'claim',
    async () => {
      const changes = await claimRun(db, { runId, orgId, instanceId })
      if (changes === 0) throw new DriveNonRetryableError('claim lost')
    },
    noRetry,
  )

  const row = await step('load', () => loadRun(db, runId, orgId), noRetry)
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
    if (wave > taskIds.length) {
      return await failClosed(step, persist, db, 'persist:terminal', ids, 'DAG_STUCK')
    }
    const current =
      wave === 0 ? row : await step(`load:${wave}`, () => loadRun(db, runId, orgId), noRetry)
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
      await writeBundle(step, persist, db, 'persist:terminal', {
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
      if (task?.invoke) {
        await runInvokeStep({
          step,
          invoke,
          hasTool,
          view,
          taskId,
          tool: task.invoke.tool,
          args: task.invoke.args,
          bundle,
          persist,
          db,
          ids,
        })
      } else if (task?.infer) {
        await runInferStep({
          step,
          infer,
          view,
          taskId,
          body: task.infer,
          bundle,
          persist,
          db,
          ids,
        })
      } else {
        bundle = {
          ...bundle,
          tasks: {
            ...bundle.tasks,
            [taskId]: { taskId, outcome: 'fail', errorCode: 'INVOKE_FAILED' },
          },
        }
        await writeBundle(step, persist, db, `persist:fail:${taskId}`, {
          ...ids,
          status: 'running',
          bundle,
        })
      }
      const latest = await loadRun(db, runId, orgId)
      const next = latest ? receiptsFromRow(latest.receipt_json, taskIds) : null
      if (!next) {
        return await failClosed(
          step,
          persist,
          db,
          'persist:invalid-receipts',
          ids,
          'RECEIPTS_INVALID',
        )
      }
      bundle = next
    }
    wave += 1
  }
}
