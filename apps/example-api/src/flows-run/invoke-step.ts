/** Invoke dispatch. Persist inside the step; step return stays small. */

import type { ReceiptBundle, RunnerView, TaskReceipt } from '@kit/flows'
import { DriveNonRetryableError } from './errors'
import type { persistBundle } from './persist'

const OUTPUT_MAX = 4096
const noRetry = { retries: { limit: 0 } } as const

type DriveStep = <T>(
  name: string,
  fn: () => Promise<T>,
  config?: { retries?: { limit: number } },
) => Promise<T>

type InvokePort = (task: {
  taskId: string
  tool: string
  args?: Record<string, unknown>
}) => Promise<{ output?: string }>

type StepResult = { outcome: 'ok' } | { outcome: 'fail'; errorCode: string }

function withTask(bundle: ReceiptBundle, rec: TaskReceipt): ReceiptBundle {
  return {
    receiptVersion: 1,
    tokensUsed: bundle.tokensUsed,
    tasks: { ...bundle.tasks, [rec.taskId]: rec },
  }
}

export async function runInvokeStep(input: {
  step: DriveStep
  invoke: InvokePort
  hasTool?: (name: string) => boolean
  view: RunnerView
  taskId: string
  tool: string
  args?: Record<string, unknown>
  bundle: ReceiptBundle
  persist: typeof persistBundle
  db: D1Database
  ids: { runId: string; orgId: string }
}): Promise<void> {
  const { step, invoke, hasTool, view, taskId, tool, args, bundle, persist, db, ids } = input
  await step(
    `invoke:${taskId}`,
    async (): Promise<StepResult> => {
      let rec: TaskReceipt
      try {
        if (!view.executionTools.includes(tool)) {
          rec = { taskId, outcome: 'fail', errorCode: 'TOOL_NOT_IN_EXECUTION_TOOLS' }
        } else if (hasTool && !hasTool(tool)) {
          rec = { taskId, outcome: 'fail', errorCode: 'UNKNOWN_TOOL' }
        } else {
          const out = await invoke({ taskId, tool, args })
          const output =
            typeof out.output === 'string'
              ? out.output.length > OUTPUT_MAX
                ? out.output.slice(0, OUTPUT_MAX)
                : out.output
              : undefined
          rec = { taskId, outcome: 'ok', output }
        }
      } catch {
        rec = { taskId, outcome: 'fail', errorCode: 'INVOKE_FAILED' }
      }
      const changes = await persist(db, {
        ...ids,
        status: 'running',
        receiptJson: JSON.stringify(withTask(bundle, rec)),
        errorCode: null,
      })
      if (changes !== 1) throw new DriveNonRetryableError('persist lost')
      return rec.outcome === 'ok'
        ? { outcome: 'ok' }
        : { outcome: 'fail', errorCode: rec.errorCode ?? 'INVOKE_FAILED' }
    },
    noRetry,
  )
}
