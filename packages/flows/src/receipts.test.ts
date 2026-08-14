import { describe, expect, it } from 'vitest'
import { FLOW_RUN_STATUSES, parseReceipts, readRunRollup, TASK_RECEIPT_OUTCOMES } from './receipts'

const emptyBundle = { receiptVersion: 1 as const, tokensUsed: 0, tasks: {} }

describe('parseReceipts', () => {
  it('rejects extra keys on the bundle via strict', () => {
    const result = parseReceipts({ ...emptyBundle, extra: true })
    expect(result.ok).toBe(false)
  })

  it('rejects extra keys on a task receipt via strict', () => {
    const result = parseReceipts({
      receiptVersion: 1,
      tokensUsed: 0,
      tasks: { a: { taskId: 'a', outcome: 'ok', extra: true } },
    })
    expect(result.ok).toBe(false)
  })

  it('rejects an unknown task id when taskIds is passed', () => {
    const result = parseReceipts(
      {
        receiptVersion: 1,
        tokensUsed: 0,
        tasks: { z: { taskId: 'z', outcome: 'ok' } },
      },
      ['a', 'b'],
    )
    expect(result.ok).toBe(false)
  })

  it('allows empty tasks when taskIds is omitted (error-bundle path)', () => {
    const result = parseReceipts(emptyBundle)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.receipts.tasks).toEqual({})
      expect(result.receipts.receiptVersion).toBe(1)
      expect(result.receipts.tokensUsed).toBe(0)
    }
  })

  it('rejects fail without errorCode', () => {
    const result = parseReceipts({
      receiptVersion: 1,
      tokensUsed: 0,
      tasks: { a: { taskId: 'a', outcome: 'fail' } },
    })
    expect(result.ok).toBe(false)
  })
})

describe('TASK_RECEIPT_OUTCOMES', () => {
  it('includes waiting as a typed outcome without requiring a producer', () => {
    expect(TASK_RECEIPT_OUTCOMES).toContain('waiting')
    expect(TASK_RECEIPT_OUTCOMES).toEqual(expect.arrayContaining(['ok', 'skip', 'fail', 'waiting']))
    const result = parseReceipts({
      receiptVersion: 1,
      tokensUsed: 0,
      tasks: { a: { taskId: 'a', outcome: 'waiting' } },
    })
    expect(result.ok).toBe(true)
  })
})

describe('readRunRollup', () => {
  it('returns app status and parsed receipts and ignores extra instanceStatus', () => {
    expect(readRunRollup.length).toBe(1)
    const result = readRunRollup({
      status: 'failed',
      receiptJson: JSON.stringify(emptyBundle),
      errorCode: 'ORG_MISMATCH',
      instanceStatus: 'complete',
    })
    expect(result.status).toBe('failed')
    expect(result.status).not.toBe('complete')
    expect(result.receipts).toMatchObject(emptyBundle)
    expect(result.errorCode).toBe('ORG_MISMATCH')
  })
})

describe('FLOW_RUN_STATUSES', () => {
  it('includes queued running succeeded failed cancelled and not CF complete or errored', () => {
    expect(FLOW_RUN_STATUSES).toEqual(
      expect.arrayContaining(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
    )
    expect(FLOW_RUN_STATUSES).not.toContain('complete')
    expect(FLOW_RUN_STATUSES).not.toContain('errored')
  })
})
