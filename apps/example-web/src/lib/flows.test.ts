import { afterEach, describe, expect, it, vi } from 'vitest'
import { flowErrorLabel, flowOutcomeLabel, flowsEn } from '../messages/flows-catalog'
import { createApiDispatcher } from '../test/api-mock'
import { ApiError, apiFetch, HttpError } from './api'
import {
  denialFromError,
  fetchFlowRun,
  isFlowRunId,
  patchPlanEnabled,
  postFlowApproval,
  timelineFromReceipts,
} from './flows'

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return { ...actual, apiFetch: vi.fn() }
})

const fetchMock = vi.mocked(apiFetch)

afterEach(() => {
  fetchMock.mockReset()
})

describe('flow run id', () => {
  it('accepts a path segment and rejects traversal', () => {
    expect(isFlowRunId('run_b2d0cdbe1c23499385a2fcf6d84c5628')).toBe(true)
    expect(isFlowRunId('run_waiting_33')).toBe(true)
    expect(isFlowRunId('..%2F')).toBe(false)
    expect(isFlowRunId('../')).toBe(false)
    expect(isFlowRunId('a/b')).toBe(false)
  })
})

describe('flow fetch paths', () => {
  it('encodes run and plan ids so a slash cannot escape the path', async () => {
    fetchMock.mockImplementation(
      createApiDispatcher()
        .on('GET', '/api/flows/runs/..%2Fsecret', () => ({ requestId: 'r' }))
        .on('PATCH', '/api/flows/plans/plan_..%2Fx', () => ({ requestId: 'r' })).fetch,
    )
    await fetchFlowRun('org_acme', '../secret')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/flows/runs/..%2Fsecret',
      expect.objectContaining({ headers: { 'X-Org-Id': 'org_acme' } }),
    )
    fetchMock.mockClear()
    await patchPlanEnabled('org_acme', 'plan_../x', false)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/flows/plans/plan_..%2Fx')
  })

  it('posts approval with org header and encoded run/task ids (Roxabi/roxabi-boilerplate-cf#288)', async () => {
    fetchMock.mockImplementation(
      createApiDispatcher().on(
        'POST',
        '/api/flows/runs/run_..%2Fx/tasks/task%2Fa/approval',
        () => ({
          runId: 'run_1',
          taskId: 'gate',
          decision: 'approved',
          woken: true,
          requestId: 'r',
        }),
      ).fetch,
    )
    await postFlowApproval('org_acme', 'run_../x', 'task/a', 'approved')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/flows/runs/run_..%2Fx/tasks/task%2Fa/approval',
      expect.objectContaining({
        method: 'POST',
        headers: { 'X-Org-Id': 'org_acme' },
        body: JSON.stringify({ decision: 'approved' }),
      }),
    )
  })
})

describe('timelineFromReceipts', () => {
  it('keeps waiting receipts and a complete approval stamp', () => {
    expect(
      timelineFromReceipts({
        receiptVersion: 1,
        tokensUsed: 0,
        tasks: {
          gate: {
            taskId: 'gate',
            outcome: 'waiting',
            approval: { by: 'user_staff', at: '2026-09-25T12:00:00.000Z' },
          },
        },
      }),
    ).toEqual([
      {
        taskId: 'gate',
        outcome: 'waiting',
        approval: { by: 'user_staff', at: '2026-09-25T12:00:00.000Z' },
      },
    ])
  })

  it('drops a stamp that has only by or only at', () => {
    const onlyBy = timelineFromReceipts({
      receiptVersion: 1,
      tokensUsed: 0,
      tasks: { gate: { taskId: 'gate', outcome: 'ok', approval: { by: 'user_staff', at: '' } } },
    })
    expect(onlyBy[0]?.approval).toBeUndefined()
    const onlyAt = timelineFromReceipts({
      receiptVersion: 1,
      tokensUsed: 0,
      tasks: {
        gate: {
          taskId: 'gate',
          outcome: 'fail',
          errorCode: 'X',
          approval: { by: '', at: '2026-09-25T12:00:00.000Z' },
        },
      },
    })
    expect(onlyAt[0]?.approval).toBeUndefined()
  })
})

describe('catalog labels', () => {
  it('does not echo raw wire enums', () => {
    expect(flowOutcomeLabel('waiting', flowsEn)).toBe('Waiting')
    expect(flowOutcomeLabel('waiting', flowsEn)).not.toBe('waiting')
    expect(flowErrorLabel('APPROVAL_REJECTED', flowsEn)).toBe('Approval rejected')
    expect(flowErrorLabel('APPROVAL_REJECTED', flowsEn)).not.toBe('APPROVAL_REJECTED')
    expect(flowErrorLabel('NOT_A_CODE', flowsEn)).toBe('Unknown')
  })
})

describe('flows denial', () => {
  it('maps 404 and 403', () => {
    expect(
      denialFromError(
        new ApiError(404, { error: { code: 'NOT_FOUND', message: 'no' }, requestId: 'r' }),
      ),
    ).toBe('not_found')
    expect(
      denialFromError(
        new ApiError(403, { error: { code: 'FORBIDDEN', message: 'no' }, requestId: 'r' }),
      ),
    ).toBe('forbidden')
    expect(denialFromError(new HttpError(404))).toBe('not_found')
    expect(denialFromError(new HttpError(403))).toBe('forbidden')
    expect(denialFromError(new HttpError(500))).toBeNull()
    expect(denialFromError(new Error('HTTP 404'))).toBeNull()
  })
})
