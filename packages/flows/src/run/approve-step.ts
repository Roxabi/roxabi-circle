/** Approve dispatch. A D1 decision row is the only authorization; a wake only retries the read. */

import { type TaskReceipt, withTask } from '../receipts'
import { DriveNonRetryableError } from './errors'
import { loadRunApproval, type RunApproval, recordRunApproval } from './persist'
import {
  commitReceipts,
  type DriveStep,
  enterEffect,
  noRetry,
  type StepReceiptCtx,
  writeTaskReceipt,
} from './step-io'

const idempotent = { retries: { limit: 3 } } as const
const MAX_APPROVAL_WAITS = 8
const HOUR_MS = 60 * 60 * 1000

export type AwaitApprovalPort = (
  taskId: string,
  timeoutMs: number,
  attempt: number,
) => Promise<'event' | 'timeout'>

export type ApprovalNotice = Readonly<{ orgId: string; runId: string; taskId: string }>
export type ApprovalNotificationPorts = Readonly<{
  opened?: (notice: ApprovalNotice) => Promise<void>
  closed?: (
    notice: ApprovalNotice &
      Readonly<{ outcome: 'approved' | 'rejected' | 'expired' | 'cancelled' }>,
  ) => Promise<void>
}>

async function notifyApproval(
  step: DriveStep,
  phase: 'opened' | 'closed',
  notice: ApprovalNotice,
  callback: () => Promise<void>,
): Promise<void> {
  try {
    await step(
      `approve:notification:${phase}:${notice.taskId}`,
      async () => {
        try {
          await callback()
        } catch {
          throw new Error('APPROVAL_NOTIFICATION_FAILED')
        }
      },
      idempotent,
    )
  } catch {
    console.error(JSON.stringify({ event: 'flows.approval_notification_failed', phase, ...notice }))
  }
}

function receiptFor(taskId: string, row: RunApproval): TaskReceipt {
  const approval = { by: row.decidedBy, at: new Date(row.decidedAt).toISOString() }
  if (row.decision === 'approved') return { taskId, outcome: 'ok', approval }
  if (row.decision === 'rejected') {
    return { taskId, outcome: 'fail', errorCode: 'APPROVAL_REJECTED', approval }
  }
  return { taskId, outcome: 'fail', errorCode: 'APPROVAL_TIMEOUT', approval }
}

/**
 * Open a waiting approve task, wake until a decision row or the deadline, then
 * persist ok/fail from the row that won.
 *
 * @invariant approve-continues-only-on-d1-decision: only an org+run+task D1 row with decision=approved turns waiting into ok; a Workflow event only wakes; without an approval the task fails only via its own expired row at the deadline or after 8 wakes with no row, a rejected row, or a missing wait port — Roxabi/roxabi-boilerplate-cf#32
 */
export async function runApproveStep(input: {
  step: DriveStep
  awaitApproval?: AwaitApprovalPort
  approvalNotifications?: ApprovalNotificationPorts
  taskId: string
  timeoutHours: number
  io: StepReceiptCtx
}): Promise<void> {
  const { step, awaitApproval, taskId, timeoutHours, io } = input
  const { db, ids } = io
  if (!awaitApproval) {
    await step(
      `approve:unsupported:${taskId}`,
      () => writeTaskReceipt(io, { taskId, outcome: 'fail', errorCode: 'APPROVAL_UNSUPPORTED' }),
      noRetry,
    )
    return
  }

  const opened = await step(
    `approve:open:${taskId}`,
    async () => {
      const entry = await enterEffect(io, taskId)
      const terminal = entry.kind === 'lost' || entry.kind === 'done'
      if (entry.kind === 'fresh') {
        await commitReceipts(io, {
          status: 'running',
          bundle: withTask(entry.bundle, { taskId, outcome: 'waiting' }),
          errorCode: null,
        })
      }
      return { deadlineMs: Date.now() + timeoutHours * HOUR_MS, terminal }
    },
    noRetry,
  )
  if (opened.terminal) return

  const notice: ApprovalNotice = { ...ids, taskId }
  if (input.approvalNotifications?.opened) {
    const callback = input.approvalNotifications.opened
    await notifyApproval(step, 'opened', notice, () => callback(notice))
  }

  let row = await step(
    `approve:read:${taskId}:0`,
    () => loadRunApproval(db, { ...ids, taskId }),
    idempotent,
  )
  let attempt = 0
  while (!row && attempt < MAX_APPROVAL_WAITS) {
    // Replay uses this step's recorded now, not a deadline recomputed outside open.
    const now = await step(`approve:clock:${taskId}:${attempt}`, async () => Date.now(), idempotent)
    const remaining = opened.deadlineMs - now
    if (remaining <= 0) break
    const statusRow = await io.load(db, ids.runId, ids.orgId)
    if (statusRow?.status === 'cancelled') throw new DriveNonRetryableError('cancelled')
    const wake = await awaitApproval(taskId, remaining, attempt)
    void wake
    attempt += 1
    row = await step(
      `approve:read:${taskId}:${attempt}`,
      () => loadRunApproval(db, { ...ids, taskId }),
      idempotent,
    )
  }

  if (!row) {
    await step(
      `approve:expire:${taskId}`,
      () =>
        recordRunApproval(db, {
          ...ids,
          taskId,
          decision: 'expired',
          decidedBy: 'flows:timeout',
        }),
      idempotent,
    )
    row = await step(
      `approve:read:${taskId}:final`,
      () => loadRunApproval(db, { ...ids, taskId }),
      idempotent,
    )
  }
  if (!row) throw new DriveNonRetryableError('APPROVAL_TIMEOUT')

  const decided = row
  await step(
    `approve:resolve:${taskId}`,
    async () => {
      const rec = receiptFor(taskId, decided)
      await writeTaskReceipt(io, rec)
      return rec.outcome === 'ok'
        ? { outcome: 'ok' as const }
        : { outcome: 'fail' as const, errorCode: rec.errorCode ?? 'APPROVAL_TIMEOUT' }
    },
    noRetry,
  )
  if (input.approvalNotifications?.closed) {
    const callback = input.approvalNotifications.closed
    await notifyApproval(step, 'closed', notice, () =>
      callback({ ...notice, outcome: decided.decision }),
    )
  }
}
