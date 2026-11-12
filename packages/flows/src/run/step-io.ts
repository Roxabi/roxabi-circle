/** Step-local receipt IO. One persist-count check for task writes and bundle rollups. */

import { BindingUnresolvedError, resolveWholeBindings } from '../bindings'
import {
  RECEIPT_OUTPUT_MAX_CHARS,
  REDACTED_OUTPUT_MARKER,
  type ReceiptBundle,
  receiptsFromRow,
  type TaskReceipt,
  withTask,
} from '../receipts'
import { DriveNonRetryableError } from './errors'
import { type FlowRunRow, type persistBundle, scrubReceiptJson } from './persist'

export type DriveStep = <T>(
  name: string,
  fn: () => Promise<T>,
  config?: { retries?: { limit: number } },
) => Promise<T>

type LoadFn = (db: D1Database, runId: string, orgId: string) => Promise<FlowRunRow | null>

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

export const noRetry = { retries: { limit: 0 } } as const

export { BindingUnresolvedError, resolveWholeBindings }

/** Write-time redaction: sensitive → marker; else existing char cap. */
export function redactReceiptOutput(
  output: string | undefined,
  sensitive: boolean,
): string | undefined {
  if (output === undefined) return undefined
  if (sensitive) return REDACTED_OUTPUT_MARKER
  return output.length > RECEIPT_OUTPUT_MAX_CHARS
    ? output.slice(0, RECEIPT_OUTPUT_MAX_CHARS)
    : output
}

export type StepReceiptCtx = {
  persist: typeof persistBundle
  load: LoadFn
  db: D1Database
  ids: { runId: string; orgId: string }
  taskIds: readonly string[]
}

/** Missing run and corrupt receipts fail closed before any write. Empty raw is an empty bundle. */
async function loadStepReceipts(ctx: StepReceiptCtx): Promise<ReceiptBundle> {
  const row = await ctx.load(ctx.db, ctx.ids.runId, ctx.ids.orgId)
  if (!row) throw new DriveNonRetryableError('run not found')
  const base = receiptsFromRow(row.receipt_json, ctx.taskIds)
  if (!base) throw new DriveNonRetryableError('RECEIPTS_INVALID')
  return base
}

/** The only `changes !== 1` check. Callers choose status, bundle, and errorCode. */
export async function commitReceipts(
  io: StepReceiptCtx,
  input: { status: string; bundle: ReceiptBundle; errorCode?: string | null },
): Promise<void> {
  const changes = await io.persist(io.db, {
    runId: io.ids.runId,
    orgId: io.ids.orgId,
    status: input.status,
    receiptJson: JSON.stringify(input.bundle),
    errorCode: input.errorCode,
  })
  if (changes === 1) return
  const row = await io.load(io.db, io.ids.runId, io.ids.orgId)
  if (row?.status === 'cancelled') throw new DriveNonRetryableError('cancelled')
  throw new DriveNonRetryableError('persist lost')
}

/** Load, merge one task, persist status running with errorCode cleared. Always reloads. */
export async function writeTaskReceipt(io: StepReceiptCtx, rec: TaskReceipt): Promise<void> {
  const base = await loadStepReceipts(io)
  await commitReceipts(io, { status: 'running', bundle: withTask(base, rec), errorCode: null })
}

export type EffectEntry =
  | { kind: 'fresh'; bundle: ReceiptBundle; alreadyStarted?: boolean }
  | { kind: 'lost' }
  | { kind: 'waiting' }
  | { kind: 'done'; outcome: 'ok' | 'fail' | 'skip'; errorCode?: string }

/** Map leftover started receipts to fail/RECEIPT_LOST. `started` is in-flight only. */
export function failStartedTasks(bundle: ReceiptBundle): { bundle: ReceiptBundle; lost: boolean } {
  let lost = false
  const tasks = { ...bundle.tasks }
  for (const [id, rec] of Object.entries(bundle.tasks)) {
    if (rec.outcome !== 'started') continue
    tasks[id] = { taskId: id, outcome: 'fail', errorCode: 'RECEIPT_LOST' }
    lost = true
  }
  return { bundle: lost ? { ...bundle, tasks } : bundle, lost }
}

/**
 * One load of the task slot, before any write for this step.
 * - fresh: no receipt; the caller runs its checks, then `commitStarted` from this bundle.
 * - lost: `started` survived a prior entry; closed fail/RECEIPT_LOST here (receipt-only when already terminal), no port call.
 * - done: ok/fail/skip already recorded; no write, no port call.
 * - waiting: approve only.
 */
export type EnterEffectOpts = {
  /**
   * CF Workflows read-retry (Roxabi/roxabi-boilerplate-cf#234): a leftover `started` means "retry the port",
   * not RECEIPT_LOST. Callers must not re-`commitStarted` when resuming.
   */
  resumeStarted?: boolean
}

export async function enterEffect(
  io: StepReceiptCtx,
  taskId: string,
  opts?: EnterEffectOpts,
): Promise<EffectEntry> {
  const row = await io.load(io.db, io.ids.runId, io.ids.orgId)
  if (!row) throw new DriveNonRetryableError('run not found')
  const bundle = receiptsFromRow(row.receipt_json, io.taskIds)
  if (!bundle) throw new DriveNonRetryableError('RECEIPTS_INVALID')
  const existing = bundle.tasks[taskId]
  if (!existing) return { kind: 'fresh', bundle }
  if (existing.outcome === 'started') {
    if (opts?.resumeStarted) return { kind: 'fresh', bundle, alreadyStarted: true }
    const closed = withTask(bundle, { taskId, outcome: 'fail', errorCode: 'RECEIPT_LOST' })
    const open = row.status === 'queued' || row.status === 'running'
    if (open) {
      await commitReceipts(io, { status: 'running', bundle: closed, errorCode: null })
      return { kind: 'lost' }
    }
    const changes = await scrubReceiptJson(io.db, {
      runId: io.ids.runId,
      orgId: io.ids.orgId,
      receiptJson: JSON.stringify(closed),
    })
    if (changes !== 1) throw new DriveNonRetryableError('persist lost')
    throw new DriveNonRetryableError('RECEIPT_LOST')
  }
  if (existing.outcome === 'waiting') return { kind: 'waiting' }
  return { kind: 'done', outcome: existing.outcome, errorCode: existing.errorCode }
}

/** Marker before the port, committed from the bundle `enterEffect` loaded. */
export async function commitStarted(
  io: StepReceiptCtx,
  bundle: ReceiptBundle,
  taskId: string,
): Promise<void> {
  await commitReceipts(io, {
    status: 'running',
    bundle: withTask(bundle, { taskId, outcome: 'started' }),
    errorCode: null,
  })
}
