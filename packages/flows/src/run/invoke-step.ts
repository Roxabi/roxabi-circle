/** Invoke dispatch. In-step D1 RMW; step return stays small (no tool text). */

import { BindingUnresolvedError, bindingTaskIds, resolveWholeBindings } from '../bindings'
import { type ReceiptBundle, receiptsFromRow, type TaskReceipt, withTask } from '../receipts'
import type { RunnerView } from '../snapshot'
import { DriveNonRetryableError } from './errors'
import {
  commitReceipts,
  commitStarted,
  type DriveStep,
  enterEffect,
  type InvokePort,
  noRetry,
  redactReceiptOutput,
  type StepReceiptCtx,
} from './step-io'

type StepResult = { outcome: 'ok' } | { outcome: 'fail'; errorCode: string }

/** Kit retry only when the sealed effect is `'read'`; missing / write / unknown → limit 0 (Roxabi/roxabi-boilerplate-cf#234). */
function invokeRetries(view: RunnerView, tool: string): { retries: { limit: number } } {
  const effect = view.toolEffects?.[tool] ?? 'write'
  return { retries: { limit: effect === 'read' ? 3 : 0 } }
}

function denyCode(
  view: RunnerView,
  tool: string,
  hasTool?: (name: string) => boolean,
): string | null {
  if (!view.executionTools.includes(tool)) return 'TOOL_NOT_IN_EXECUTION_TOOLS'
  if (hasTool && !hasTool(tool)) return 'UNKNOWN_TOOL'
  return null
}

function outputsFromReceipts(
  tasks: Record<string, TaskReceipt | undefined>,
): ReadonlyMap<string, string | undefined> {
  const map = new Map<string, string | undefined>()
  for (const [id, rec] of Object.entries(tasks)) {
    if (!rec) continue
    map.set(id, typeof rec.output === 'string' ? rec.output : undefined)
  }
  return map
}

/** Resolve bindings from the in-memory bundle (no extra D1 load). Fail before `started`. */
function resolveArgsFromBundle(
  args: Record<string, unknown> | undefined,
  bundle: ReceiptBundle,
):
  | { ok: true; args: Record<string, unknown> | undefined }
  | { ok: false; errorCode: 'BINDING_UNRESOLVED' } {
  if (bindingTaskIds(args).length === 0) return { ok: true, args }
  try {
    return { ok: true, args: resolveWholeBindings(args, outputsFromReceipts(bundle.tasks)) }
  } catch (err) {
    if (err instanceof BindingUnresolvedError) return { ok: false, errorCode: 'BINDING_UNRESOLVED' }
    throw err
  }
}

async function callTool(input: {
  invoke: InvokePort
  isSensitive?: (name: string) => boolean
  taskId: string
  tool: string
  args?: Record<string, unknown>
  /** When true, port throws reach step.do so CF can retry (Roxabi/roxabi-boilerplate-cf#234). */
  rethrowPortThrows?: boolean
}): Promise<TaskReceipt> {
  const { invoke, isSensitive, taskId, tool, args, rethrowPortThrows } = input
  try {
    const out = await invoke({ taskId, tool, args })
    const raw = typeof out.output === 'string' ? out.output : undefined
    const output = redactReceiptOutput(raw, isSensitive?.(tool) === true)
    return { taskId, outcome: 'ok', output }
  } catch (err) {
    if (rethrowPortThrows) throw err
    return { taskId, outcome: 'fail', errorCode: 'INVOKE_FAILED' }
  }
}

async function invokeFresh(input: {
  invoke: InvokePort
  hasTool?: (name: string) => boolean
  isSensitive?: (name: string) => boolean
  view: RunnerView
  taskId: string
  tool: string
  args?: Record<string, unknown>
  io: StepReceiptCtx
  bundle: ReceiptBundle
  rethrowPortThrows?: boolean
  alreadyStarted?: boolean
}): Promise<StepResult> {
  const {
    invoke,
    hasTool,
    isSensitive,
    view,
    taskId,
    tool,
    args,
    io,
    bundle,
    rethrowPortThrows,
    alreadyStarted,
  } = input
  const denied = denyCode(view, tool, hasTool)
  if (denied) {
    await commitReceipts(io, {
      status: 'running',
      bundle: withTask(bundle, { taskId, outcome: 'fail', errorCode: denied }),
      errorCode: null,
    })
    return { outcome: 'fail', errorCode: denied }
  }
  const resolved = resolveArgsFromBundle(args, bundle)
  if (!resolved.ok) {
    await commitReceipts(io, {
      status: 'running',
      bundle: withTask(bundle, { taskId, outcome: 'fail', errorCode: resolved.errorCode }),
      errorCode: null,
    })
    return { outcome: 'fail', errorCode: resolved.errorCode }
  }
  if (!alreadyStarted) await commitStarted(io, bundle, taskId)
  const rec = await callTool({
    invoke,
    isSensitive,
    taskId,
    tool,
    args: resolved.args,
    rethrowPortThrows,
  })
  await commitReceipts(io, {
    status: 'running',
    bundle: withTask(bundle, rec),
    errorCode: null,
  })
  return rec.outcome === 'ok'
    ? { outcome: 'ok' }
    : { outcome: 'fail', errorCode: rec.errorCode ?? 'INVOKE_FAILED' }
}

async function runInvokeEffect(input: {
  invoke: InvokePort
  hasTool?: (name: string) => boolean
  isSensitive?: (name: string) => boolean
  view: RunnerView
  taskId: string
  tool: string
  args?: Record<string, unknown>
  io: StepReceiptCtx
  rethrowPortThrows?: boolean
}): Promise<StepResult> {
  const { taskId, io, rethrowPortThrows } = input
  const statusRow = await io.load(io.db, io.ids.runId, io.ids.orgId)
  if (statusRow?.status === 'cancelled') throw new DriveNonRetryableError('cancelled')
  const entry = await enterEffect(io, taskId, { resumeStarted: rethrowPortThrows === true })
  if (entry.kind === 'lost') return { outcome: 'fail', errorCode: 'RECEIPT_LOST' }
  if (entry.kind === 'waiting') return { outcome: 'fail', errorCode: 'WAITING_NOT_SUPPORTED' }
  if (entry.kind === 'done') {
    return entry.outcome === 'ok'
      ? { outcome: 'ok' }
      : { outcome: 'fail', errorCode: entry.errorCode ?? 'INVOKE_FAILED' }
  }
  return invokeFresh({
    ...input,
    bundle: entry.bundle,
    alreadyStarted: entry.alreadyStarted === true,
  })
}

export async function runInvokeStep(input: {
  step: DriveStep
  invoke: InvokePort
  hasTool?: (name: string) => boolean
  /** Live Worker registry: sensitiveOutput tools → marker at D1 write (Roxabi/roxabi-boilerplate-cf#231). */
  isSensitive?: (name: string) => boolean
  view: RunnerView
  taskId: string
  tool: string
  args?: Record<string, unknown>
  io: StepReceiptCtx
}): Promise<void> {
  const { step, invoke, hasTool, isSensitive, view, taskId, tool, args, io } = input
  const retries = invokeRetries(view, tool)
  // Port throws must reach step.do so CF can retry; catch-converting first kills limit 3.
  const rethrowPortThrows = retries.retries.limit > 0
  try {
    await step(
      `invoke:${taskId}`,
      () =>
        runInvokeEffect({
          invoke,
          hasTool,
          isSensitive,
          view,
          taskId,
          tool,
          args,
          io,
          rethrowPortThrows,
        }),
      retries,
    )
  } catch (err) {
    if (err instanceof DriveNonRetryableError) throw err
    // Only convert port-retry exhaustion. Persist/other failures must surface (Roxabi/roxabi-boilerplate-cf#229).
    if (!rethrowPortThrows) throw err
    // Read retries exhausted — overwrite started with INVOKE_FAILED (not RECEIPT_LOST).
    await step(
      `invoke:${taskId}:failed`,
      async (): Promise<StepResult> => {
        const row = await io.load(io.db, io.ids.runId, io.ids.orgId)
        if (!row) throw new DriveNonRetryableError('run not found')
        const bundle = receiptsFromRow(row.receipt_json, io.taskIds)
        if (!bundle) throw new DriveNonRetryableError('RECEIPTS_INVALID')
        await commitReceipts(io, {
          status: 'running',
          bundle: withTask(bundle, {
            taskId,
            outcome: 'fail',
            errorCode: 'INVOKE_FAILED',
          }),
          errorCode: null,
        })
        return { outcome: 'fail', errorCode: 'INVOKE_FAILED' }
      },
      noRetry,
    )
  }
}
