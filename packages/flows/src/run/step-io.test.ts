import { describe, expect, it, vi } from 'vitest'
import { emptyBundle } from '../receipts'
import { DriveNonRetryableError } from './errors'
import type { FlowRunRow, persistBundle } from './persist'
import { commitReceipts, writeTaskReceipt } from './step-io'

const IDS = { runId: 'run_1', orgId: 'org_a' }
const TASK_IDS = ['echo'] as const
const REC = { taskId: 'echo', outcome: 'ok' as const }

function row(receiptJson: string | null): FlowRunRow {
  return {
    id: IDS.runId,
    org_id: IDS.orgId,
    plan_id: 'plan_1',
    plan_key: 'echo',
    status: 'running',
    actor_id: 'actor_1',
    snapshot_json: '{}',
    plan_digest: 'digest',
    workflow_instance_id: null,
    receipt_json: receiptJson,
    error_code: null,
    created_at: 0,
    updated_at: 0,
  }
}

function harness(loadRow: FlowRunRow | null, changes = 1) {
  const persist = vi.fn(
    async (_db: D1Database, _input: Parameters<typeof persistBundle>[1]) => changes,
  )
  const load = vi.fn(async () => loadRow)
  return {
    persist,
    load,
    io: {
      persist,
      load,
      db: {} as D1Database,
      ids: IDS,
      taskIds: TASK_IDS,
    },
  }
}

async function rejection(run: () => Promise<unknown>) {
  try {
    await run()
  } catch (err) {
    return err
  }
  throw new Error('expected throw')
}

describe('commitReceipts', () => {
  it('throws persist lost when persist does not report exactly one change', async () => {
    for (const changes of [0, 2]) {
      const { io } = harness(row(null), changes)
      const err = await rejection(() =>
        commitReceipts(io, { status: 'failed', bundle: emptyBundle(), errorCode: 'ORG_MISMATCH' }),
      )
      expect(err).toBeInstanceOf(DriveNonRetryableError)
      expect((err as Error).message).toBe('persist lost')
    }
  })

  it('throws cancelled when persist reports zero and the row is cancelled', async () => {
    const cancelled = { ...row(null), status: 'cancelled' }
    const { io, load } = harness(cancelled, 0)
    const err = await rejection(() =>
      commitReceipts(io, { status: 'succeeded', bundle: emptyBundle(), errorCode: null }),
    )
    expect(err).toBeInstanceOf(DriveNonRetryableError)
    expect((err as Error).message).toBe('cancelled')
    expect(load).toHaveBeenCalledOnce()
  })

  it('writes the caller status, bundle, and errorCode', async () => {
    const { io, persist, load } = harness(row(null))
    const bundle = { ...emptyBundle(), tokensUsed: 9 }
    await commitReceipts(io, { status: 'failed', bundle, errorCode: 'ORG_MISMATCH' })
    expect(load).not.toHaveBeenCalled()
    expect(persist).toHaveBeenCalledOnce()
    const written = persist.mock.calls[0]?.[1]
    expect(written).toMatchObject({
      runId: IDS.runId,
      orgId: IDS.orgId,
      status: 'failed',
      errorCode: 'ORG_MISMATCH',
    })
    expect(JSON.parse(written?.receiptJson as string)).toEqual(bundle)
  })
})

describe('writeTaskReceipt', () => {
  it('throws run not found and does not persist when the run row is missing', async () => {
    const { io, persist } = harness(null)
    const err = await rejection(() => writeTaskReceipt(io, REC))
    expect(err).toBeInstanceOf(DriveNonRetryableError)
    expect((err as Error).message).toBe('run not found')
    expect(persist).not.toHaveBeenCalled()
  })

  it('throws RECEIPTS_INVALID and does not persist when receipt_json does not parse', async () => {
    const { io, persist } = harness(row('{'))
    const err = await rejection(() => writeTaskReceipt(io, REC))
    expect(err).toBeInstanceOf(DriveNonRetryableError)
    expect((err as Error).message).toBe('RECEIPTS_INVALID')
    expect(persist).not.toHaveBeenCalled()
  })

  it('throws persist lost when persist does not report exactly one change', async () => {
    for (const changes of [0, 2]) {
      const { io } = harness(row(null), changes)
      const err = await rejection(() => writeTaskReceipt(io, REC))
      expect(err).toBeInstanceOf(DriveNonRetryableError)
      expect((err as Error).message).toBe('persist lost')
    }
  })

  it('loads once, writes status running, clears errorCode, and merges the task', async () => {
    const prior = JSON.stringify({
      receiptVersion: 1,
      tokensUsed: 4,
      tasks: { other: { taskId: 'other', outcome: 'ok' } },
    })
    const { io, persist, load } = harness(row(prior))
    await writeTaskReceipt({ ...io, taskIds: ['echo', 'other'] }, REC)
    expect(load).toHaveBeenCalledOnce()
    expect(persist).toHaveBeenCalledOnce()
    const written = persist.mock.calls[0]?.[1]
    expect(written).toMatchObject({
      runId: IDS.runId,
      orgId: IDS.orgId,
      status: 'running',
      errorCode: null,
    })
    expect(JSON.parse(written?.receiptJson as string)).toEqual({
      receiptVersion: 1,
      tokensUsed: 4,
      tasks: {
        other: { taskId: 'other', outcome: 'ok' },
        echo: { taskId: 'echo', outcome: 'ok' },
      },
    })
  })
})
