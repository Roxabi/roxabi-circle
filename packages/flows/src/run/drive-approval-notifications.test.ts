import { afterEach, describe, expect, it, vi } from 'vitest'
import { DriveNonRetryableError, driveFlowRun } from './drive'
import type { ApprovalNotificationPorts } from './index'
import {
  decide,
  decision,
  ORG,
  ownerStep,
  RUN,
  seed,
  state,
} from './test/approval-notification-fixture'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const identity = { orgId: ORG, runId: RUN, taskId: 'gate' }

describe('approval notifications through driveFlowRun', () => {
  it.each(['approved', 'rejected', 'expired'] as const)(
    'notifies the persisted %s decision after resolving the waiting receipt',
    async (outcome) => {
      const db = await seed()
      const notices: unknown[] = []
      let invokes = 0
      const drive = driveFlowRun({
        db,
        step: ownerStep(),
        payload: { orgId: ORG, runId: RUN },
        instanceId: 'wf_notice',
        invoke: async () => {
          invokes++
          return { output: 'done' }
        },
        awaitApproval: async (_task, _remaining, attempt) => {
          if (outcome !== 'expired' && attempt === 0) await decide(db, 'gate', outcome)
          return 'event'
        },
        approvalNotifications: {
          opened: async (notice) => {
            expect((await state(db)).tasks.gate?.outcome).toBe('waiting')
            notices.push(['opened', notice])
          },
          closed: async (notice) => {
            expect((await state(db)).tasks.gate?.outcome).toBe(
              outcome === 'approved' ? 'ok' : 'fail',
            )
            notices.push(['closed', notice])
          },
        },
      })
      if (outcome === 'approved') await drive
      else
        await expect(drive).rejects.toThrow(
          outcome === 'rejected' ? 'APPROVAL_REJECTED' : 'APPROVAL_TIMEOUT',
        )
      expect(notices).toEqual([
        ['opened', identity],
        ['closed', { ...identity, outcome }],
      ])
      expect(await decision(db)).toEqual({ decision: outcome })
      const row = await state(db)
      expect(row.status).toBe(outcome === 'approved' ? 'succeeded' : 'failed')
      expect(invokes).toBe(outcome === 'approved' ? 1 : 0)
      if (outcome === 'approved') expect(row.tasks.echo_hello?.outcome).toBe('ok')
    },
  )

  it('reports the decision that wins a competing expiration insert', async () => {
    const db = await seed()
    const closed: unknown[] = []
    await driveFlowRun({
      db,
      payload: { orgId: ORG, runId: RUN },
      instanceId: 'wf_notice',
      step: ownerStep({
        before: async (name) => {
          if (name === 'approve:expire:gate') await decide(db, 'gate', 'approved')
        },
      }),
      invoke: async () => ({ output: 'done' }),
      awaitApproval: async () => 'event',
      approvalNotifications: {
        closed: async (notice) => {
          closed.push(notice)
        },
      },
    })
    expect(await decision(db)).toEqual({ decision: 'approved' })
    expect((await state(db)).tasks.echo_hello?.outcome).toBe('ok')
    expect(closed).toEqual([{ ...identity, outcome: 'approved' }])
  })

  it('keeps identity distinct for sequential approval tasks', async () => {
    const db = await seed(`flows: v0
plan:
  id: two-gates
permits:
  tools: []
tasks:
  gate1:
    approve: {}
  gate2:
    after:
      - gate1
    approve: {}
`)
    const notices: unknown[] = []
    await driveFlowRun({
      db,
      step: ownerStep(),
      payload: { orgId: ORG, runId: RUN },
      instanceId: 'wf_notice',
      invoke: async () => ({}),
      awaitApproval: async (taskId) => {
        await decide(db, taskId, 'approved')
        return 'event'
      },
      approvalNotifications: {
        opened: async (notice) => {
          notices.push(['opened', notice])
        },
        closed: async (notice) => {
          notices.push(['closed', notice])
        },
      },
    })
    expect(notices).toEqual(
      ['gate1', 'gate2'].flatMap((taskId) => [
        ['opened', { orgId: ORG, runId: RUN, taskId }],
        ['closed', { orgId: ORG, runId: RUN, taskId, outcome: 'approved' }],
      ]),
    )
    expect((await state(db)).status).toBe('succeeded')
    expect(await decision(db, 'gate1')).toEqual({ decision: 'approved' })
    expect(await decision(db, 'gate2')).toEqual({ decision: 'approved' })
  })

  it('retries real callback failures inside the owner and succeeds without logging', async () => {
    const db = await seed()
    const errors: unknown[] = []
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    let attempts = 0
    await driveFlowRun({
      db,
      step: ownerStep({ errors }),
      payload: { orgId: ORG, runId: RUN },
      instanceId: 'wf_notice',
      invoke: async () => ({ output: 'done' }),
      awaitApproval: async () => {
        await decide(db, 'gate', 'approved')
        return 'event'
      },
      approvalNotifications: {
        opened: async (notice) => {
          expect(notice).toEqual(identity)
          if (++attempts === 1) throw new DriveNonRetryableError('secret callback content')
        },
      },
    })
    expect(attempts).toBe(2)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toEqual(new Error('APPROVAL_NOTIFICATION_FAILED'))
    expect(errors[0]).not.toBeInstanceOf(DriveNonRetryableError)
    expect(log).not.toHaveBeenCalled()
    expect((await state(db)).tasks.echo_hello?.outcome).toBe('ok')
  })

  it.each(['opened', 'closed'] as const)(
    'contains exhausted %s callbacks and preserves downstream execution',
    async (phase) => {
      const db = await seed()
      const errors: unknown[] = []
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      let attempts = 0
      const ports: ApprovalNotificationPorts = {
        [phase]: async () => {
          attempts++
          throw new DriveNonRetryableError('private app content')
        },
      }
      await driveFlowRun({
        db,
        step: ownerStep({ errors }),
        payload: { orgId: ORG, runId: RUN },
        instanceId: 'wf_notice',
        invoke: async () => ({ output: 'done' }),
        awaitApproval: async () => {
          await decide(db, 'gate', 'approved')
          return 'event'
        },
        approvalNotifications: ports,
      })
      expect(attempts).toBe(4)
      expect(errors).toHaveLength(4)
      for (const error of errors) {
        expect(error).toEqual(new Error('APPROVAL_NOTIFICATION_FAILED'))
        expect(error).not.toBeInstanceOf(DriveNonRetryableError)
        expect(error).not.toHaveProperty('cause')
      }
      expect(log).toHaveBeenCalledTimes(1)
      expect(log.mock.calls[0]).toHaveLength(1)
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toEqual({
        event: 'flows.approval_notification_failed',
        phase,
        ...identity,
      })
      expect(await decision(db)).toEqual({ decision: 'approved' })
      expect(await state(db)).toMatchObject({
        status: 'succeeded',
        tasks: {
          gate: { outcome: 'ok' },
          echo_hello: { outcome: 'ok' },
        },
      })
    },
  )

  it('adds no notification steps when ports are absent', async () => {
    const db = await seed()
    const names: string[] = []
    await driveFlowRun({
      db,
      step: ownerStep({ names }),
      payload: { orgId: ORG, runId: RUN },
      instanceId: 'wf_notice',
      invoke: async () => ({}),
      awaitApproval: async () => {
        await decide(db, 'gate', 'approved')
        return 'event'
      },
    })
    expect(names.filter((name) => name.startsWith('approve:notification:'))).toEqual([])
    expect((await state(db)).status).toBe('succeeded')
  })
})
