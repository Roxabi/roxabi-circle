/** Sequential InferPort + actual-token meter. Persist inside step; return stays small. */

import { DEFAULT_INFER_MAX_TOKENS } from '../constants'
import type { ReceiptBundle, TaskReceipt } from '../receipts'
import type { RunnerView } from '../snapshot'
import { DriveNonRetryableError } from './errors'
import type { persistBundle } from './persist'

const OUTPUT_MAX = 4096
const noRetry = { retries: { limit: 0 } } as const

type DriveStep = <T>(
  name: string,
  fn: () => Promise<T>,
  config?: { retries?: { limit: number } },
) => Promise<T>

type InferPort = (task: {
  taskId: string
  prompt: string
  max_tokens?: number
  model?: string
}) => Promise<{ text: string; tokens: number }>

type StepResult = { outcome: 'ok'; tokens: number } | { outcome: 'fail'; errorCode: string }

function withTask(bundle: ReceiptBundle, rec: TaskReceipt): ReceiptBundle {
  return {
    receiptVersion: 1,
    tokensUsed: bundle.tokensUsed,
    tasks: { ...bundle.tasks, [rec.taskId]: rec },
  }
}

export async function runInferStep(input: {
  step: DriveStep
  infer: InferPort | undefined
  view: RunnerView
  taskId: string
  body: { prompt: string; max_tokens?: number; model?: string }
  bundle: ReceiptBundle
  persist: typeof persistBundle
  db: D1Database
  ids: { runId: string; orgId: string }
}): Promise<void> {
  const { step, infer, view, taskId, body, bundle, persist, db, ids } = input
  const tokensUsed = bundle.tokensUsed
  const declared = body.max_tokens ?? DEFAULT_INFER_MAX_TOKENS
  const hard = view.ceilings.hardMaxTokens

  await step(
    `infer:${taskId}`,
    async (): Promise<StepResult> => {
      let rec: TaskReceipt
      let nextTokens = tokensUsed
      if (!infer || !view.allowsInfer) {
        rec = { taskId, outcome: 'fail', errorCode: 'INFER_FAILED' }
      } else if (tokensUsed + declared > hard) {
        rec = { taskId, outcome: 'fail', errorCode: 'TOKEN_CEILING' }
      } else {
        try {
          const out = await infer({ taskId, ...body })
          if (typeof out.text !== 'string' || !Number.isInteger(out.tokens) || out.tokens < 0) {
            rec = { taskId, outcome: 'fail', errorCode: 'INFER_FAILED' }
          } else if (tokensUsed + out.tokens > hard) {
            rec = { taskId, outcome: 'fail', errorCode: 'TOKEN_CEILING' }
          } else {
            const output = out.text.length > OUTPUT_MAX ? out.text.slice(0, OUTPUT_MAX) : out.text
            rec = { taskId, outcome: 'ok', output }
            nextTokens = tokensUsed + out.tokens
          }
        } catch {
          rec = { taskId, outcome: 'fail', errorCode: 'INFER_FAILED' }
        }
      }
      const next: ReceiptBundle = { ...withTask(bundle, rec), tokensUsed: nextTokens }
      const changes = await persist(db, {
        ...ids,
        status: 'running',
        receiptJson: JSON.stringify(next),
        errorCode: null,
      })
      if (changes !== 1) throw new DriveNonRetryableError('persist lost')
      return rec.outcome === 'ok'
        ? { outcome: 'ok', tokens: nextTokens - tokensUsed }
        : { outcome: 'fail', errorCode: rec.errorCode ?? 'INFER_FAILED' }
    },
    noRetry,
  )
}
