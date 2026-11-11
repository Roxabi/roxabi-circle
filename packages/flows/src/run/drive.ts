/** Snapshot-only driver. Dispatch is interpret.readyTaskIds only. */

import { z } from 'zod'
import type { interpretRun } from '../interpret'
import { emptyBundle, type ReceiptBundle, receiptsFromRow } from '../receipts'
import { parseRunnerView } from '../snapshot'
import type { ApprovalNotificationPorts, AwaitApprovalPort } from './approve-step'
import { driveWaves } from './drive-waves'
import { DriveNonRetryableError } from './errors'
import { claimRun, loadRun as defaultLoadRun, persistBundle, scrubReceiptJson } from './persist'
import {
  commitReceipts,
  type DriveStep,
  failStartedTasks,
  type InferPort,
  type InvokePort,
  noRetry,
  type StepReceiptCtx,
} from './step-io'

export { DriveNonRetryableError } from './errors'
export type { AwaitApprovalPort, DriveStep, InferPort, InvokePort }

const paramsSchema = z
  .object({
    runId: z.string().min(1).max(100),
    orgId: z.string().min(1).max(256),
  })
  .strict()

const instanceIdSchema = z.string().min(1).max(128)

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

async function writeBundle(
  step: DriveStep,
  io: StepReceiptCtx,
  name: string,
  input: { status: string; bundle: ReceiptBundle; errorCode?: string | null },
): Promise<void> {
  await step(name, () => commitReceipts(io, input), noRetry)
}

async function failClosed(
  step: DriveStep,
  io: StepReceiptCtx,
  name: string,
  errorCode: string,
  bundle: ReceiptBundle = emptyBundle(),
): Promise<never> {
  await writeBundle(step, io, name, { status: 'failed', bundle, errorCode })
  throw new DriveNonRetryableError(errorCode)
}

const closeRetries = { retries: { limit: 3 } } as const

/** Port-free: leftover `started` becomes fail/RECEIPT_LOST. Open runs fail; terminal is receipt-only. */
async function closeLostReceipts(step: DriveStep, io: StepReceiptCtx): Promise<void> {
  await step(
    'persist:receipt-lost',
    async () => {
      const row = await io.load(io.db, io.ids.runId, io.ids.orgId)
      if (!row) return
      const receipts = receiptsFromRow(row.receipt_json, io.taskIds)
      if (!receipts) return
      const closed = failStartedTasks(receipts)
      if (!closed.lost) return
      const open = row.status === 'queued' || row.status === 'running'
      if (open) {
        await commitReceipts(io, {
          status: 'failed',
          bundle: closed.bundle,
          errorCode: 'RECEIPT_LOST',
        })
        return
      }
      const changes = await scrubReceiptJson(io.db, {
        runId: io.ids.runId,
        orgId: io.ids.orgId,
        receiptJson: JSON.stringify(closed.bundle),
      })
      if (changes !== 1) throw new DriveNonRetryableError('persist lost')
    },
    closeRetries,
  )
}

export type DriveFlowRunInput = {
  step: DriveStep
  db: D1Database
  invoke: InvokePort
  infer?: InferPort
  hasTool?: (name: string) => boolean
  /** Live registry sensitiveOutput — not sealed into RunnerView (Roxabi/roxabi-boilerplate-cf#231). */
  isSensitive?: (name: string) => boolean
  awaitApproval?: AwaitApprovalPort
  approvalNotifications?: ApprovalNotificationPorts
  interpret?: typeof interpretRun
  persistBundle?: typeof persistBundle
  loadRun?: typeof defaultLoadRun
  payload: unknown
  instanceId: string
}

export async function driveFlowRun(input: DriveFlowRunInput): Promise<void> {
  const { step, db, instanceId } = input
  const persist = input.persistBundle ?? persistBundle
  const load = input.loadRun ?? defaultLoadRun

  if (!instanceIdSchema.safeParse(instanceId).success) {
    throw new DriveNonRetryableError('invalid payload')
  }
  const parsed = paramsSchema.safeParse(input.payload)
  if (!parsed.success) throw new DriveNonRetryableError('invalid payload')
  const { runId, orgId } = parsed.data
  const ids = { runId, orgId }
  let io: StepReceiptCtx = { persist, load, db, ids, taskIds: [] }

  await step(
    'claim',
    async () => {
      const changes = await claimRun(db, { runId, orgId, instanceId })
      if (changes === 0) throw new DriveNonRetryableError('claim lost')
    },
    noRetry,
  )

  const row = await step('load', () => load(db, runId, orgId), noRetry)
  if (!row) throw new DriveNonRetryableError('run not found')

  const viewParsed = parseSnapshot(row.snapshot_json)
  if (!viewParsed.ok) {
    return await failClosed(step, io, 'persist:invalid-view', 'RUNNER_VIEW_INVALID')
  }
  const view = viewParsed.runnerView
  if (view.orgId !== orgId || view.orgId !== row.org_id) {
    return await failClosed(step, io, 'persist:org-mismatch', 'ORG_MISMATCH')
  }

  const taskIds = Object.keys(view.sealedPlan.tasks)
  io = { ...io, taskIds }
  try {
    await driveWaves({ input, view, row, io, taskIds, writeBundle, failClosed })
  } catch (err) {
    await closeLostReceipts(step, io)
    throw err
  }
}
