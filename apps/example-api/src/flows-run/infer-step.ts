/** Sequential InferPort dispatch + actual-token meter (spec §8). */

import { DEFAULT_INFER_MAX_TOKENS, type RunnerView, type TaskReceipt } from '@kit/flows'

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

type InferResult =
  | { outcome: 'ok'; text: string; tokens: number }
  | { outcome: 'fail'; errorCode: string }

function failed(
  taskId: string,
  errorCode: string,
  tokensUsed: number,
): { rec: TaskReceipt; tokensUsed: number } {
  return { rec: { taskId, outcome: 'fail', errorCode }, tokensUsed }
}

export async function runInferStep(input: {
  step: DriveStep
  infer: InferPort | undefined
  view: RunnerView
  taskId: string
  body: { prompt: string; max_tokens?: number; model?: string }
  tokensUsed: number
}): Promise<{ rec: TaskReceipt; tokensUsed: number }> {
  const { step, infer, view, taskId, body, tokensUsed } = input

  if (!infer) {
    return failed(taskId, 'INFER_FAILED', tokensUsed)
  }
  if (!view.allowsInfer) {
    return failed(taskId, 'INFER_FAILED', tokensUsed)
  }

  const declared = body.max_tokens ?? DEFAULT_INFER_MAX_TOKENS
  const hard = view.ceilings.hardMaxTokens
  if (tokensUsed + declared > hard) {
    return failed(taskId, 'TOKEN_CEILING', tokensUsed)
  }

  const result = await step(
    `infer:${taskId}`,
    async (): Promise<InferResult> => {
      try {
        const out = await infer({ taskId, ...body })
        return { outcome: 'ok', text: out.text, tokens: out.tokens }
      } catch {
        return { outcome: 'fail', errorCode: 'INFER_FAILED' }
      }
    },
    noRetry,
  )
  if (result.outcome === 'fail') {
    return failed(taskId, result.errorCode, tokensUsed)
  }
  if (tokensUsed + result.tokens > hard) {
    return failed(taskId, 'TOKEN_CEILING', tokensUsed)
  }
  const output = result.text.length > OUTPUT_MAX ? result.text.slice(0, OUTPUT_MAX) : result.text
  return { rec: { taskId, outcome: 'ok', output }, tokensUsed: tokensUsed + result.tokens }
}
