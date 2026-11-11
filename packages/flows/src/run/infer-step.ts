/** Sequential InferPort + actual-token meter. In-step D1 RMW; return stays small. */

import { DEFAULT_INFER_MAX_TOKENS } from '../constants'
import {
  RECEIPT_OUTPUT_MAX_CHARS,
  type ReceiptBundle,
  type TaskReceipt,
  withTask,
} from '../receipts'
import type { RunnerView } from '../snapshot'
import { DriveNonRetryableError } from './errors'
import {
  commitReceipts,
  commitStarted,
  type DriveStep,
  enterEffect,
  type InferPort,
  noRetry,
  type StepReceiptCtx,
} from './step-io'

type StepResult = { outcome: 'ok'; tokens: number } | { outcome: 'fail'; errorCode: string }

function denyInferCode(
  infer: InferPort | undefined,
  allowsInfer: boolean,
  tokensUsed: number,
  declared: number,
  hard: number,
): string | null {
  if (!(infer && allowsInfer)) return 'INFER_FAILED'
  if (tokensUsed + declared > hard) return 'TOKEN_CEILING'
  return null
}

function receiptFromInferOut(
  taskId: string,
  tokensUsed: number,
  hard: number,
  out: { text: unknown; tokens: unknown },
): { rec: TaskReceipt; nextTokens: number } {
  if (typeof out.text !== 'string' || !Number.isInteger(out.tokens) || (out.tokens as number) < 0) {
    return { rec: { taskId, outcome: 'fail', errorCode: 'INFER_FAILED' }, nextTokens: tokensUsed }
  }
  const tokens = out.tokens as number
  if (tokensUsed + tokens > hard) {
    return { rec: { taskId, outcome: 'fail', errorCode: 'TOKEN_CEILING' }, nextTokens: tokensUsed }
  }
  const text = out.text
  const output =
    text.length > RECEIPT_OUTPUT_MAX_CHARS ? text.slice(0, RECEIPT_OUTPUT_MAX_CHARS) : text
  return { rec: { taskId, outcome: 'ok', output }, nextTokens: tokensUsed + tokens }
}

async function failInferReceipt(
  io: StepReceiptCtx,
  base: ReceiptBundle,
  taskId: string,
  errorCode: string,
): Promise<StepResult> {
  await commitReceipts(io, {
    status: 'running',
    bundle: withTask(base, { taskId, outcome: 'fail', errorCode }),
    errorCode: null,
  })
  return { outcome: 'fail', errorCode }
}

async function invokeAndCommit(
  io: StepReceiptCtx,
  infer: InferPort,
  view: RunnerView,
  taskId: string,
  body: { prompt: string; max_tokens?: number; model?: string },
  base: ReceiptBundle,
  hard: number,
): Promise<StepResult> {
  const tokensUsed = base.tokensUsed
  await commitStarted(io, base, taskId)
  let settled: { rec: TaskReceipt; nextTokens: number }
  try {
    const out = await infer({
      taskId,
      ...body,
      model: body.model ?? view.sealedPlan.plan.model,
    })
    settled = receiptFromInferOut(taskId, tokensUsed, hard, out)
  } catch {
    settled = {
      rec: { taskId, outcome: 'fail', errorCode: 'INFER_FAILED' },
      nextTokens: tokensUsed,
    }
  }
  await commitReceipts(io, {
    status: 'running',
    bundle: { ...withTask(base, settled.rec), tokensUsed: settled.nextTokens },
    errorCode: null,
  })
  return settled.rec.outcome === 'ok'
    ? { outcome: 'ok', tokens: settled.nextTokens - tokensUsed }
    : { outcome: 'fail', errorCode: settled.rec.errorCode ?? 'INFER_FAILED' }
}

async function enterInferOrFail(
  io: StepReceiptCtx,
  taskId: string,
): Promise<StepResult | { kind: 'open'; base: ReceiptBundle }> {
  const statusRow = await io.load(io.db, io.ids.runId, io.ids.orgId)
  if (statusRow?.status === 'cancelled') throw new DriveNonRetryableError('cancelled')
  const entry = await enterEffect(io, taskId)
  if (entry.kind === 'lost') return { outcome: 'fail', errorCode: 'RECEIPT_LOST' }
  if (entry.kind === 'waiting') return { outcome: 'fail', errorCode: 'WAITING_NOT_SUPPORTED' }
  if (entry.kind === 'done') {
    return entry.outcome === 'ok'
      ? { outcome: 'ok', tokens: 0 }
      : { outcome: 'fail', errorCode: entry.errorCode ?? 'INFER_FAILED' }
  }
  return { kind: 'open', base: entry.bundle }
}

export async function runInferStep(input: {
  step: DriveStep
  infer: InferPort | undefined
  view: RunnerView
  taskId: string
  body: { prompt: string; max_tokens?: number; model?: string }
  io: StepReceiptCtx
}): Promise<void> {
  const { step, infer, view, taskId, body, io } = input
  const declared = body.max_tokens ?? DEFAULT_INFER_MAX_TOKENS
  const hard = view.ceilings.hardMaxTokens

  await step(
    `infer:${taskId}`,
    async (): Promise<StepResult> => {
      const opened = await enterInferOrFail(io, taskId)
      if (!('kind' in opened)) return opened
      const { base } = opened
      const denied = denyInferCode(infer, view.allowsInfer, base.tokensUsed, declared, hard)
      if (denied || !infer) {
        return failInferReceipt(io, base, taskId, denied ?? 'INFER_FAILED')
      }
      return invokeAndCommit(io, infer, view, taskId, body, base, hard)
    },
    noRetry,
  )
}
