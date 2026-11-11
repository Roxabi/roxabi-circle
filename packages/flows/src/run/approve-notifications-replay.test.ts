import { afterEach, describe, expect, it, vi } from 'vitest'
import { type AwaitApprovalPort, runApproveStep } from './approve-step'
import type { DriveStep } from './drive'
import type { ApprovalNotificationPorts } from './index'
import { loadRun, persistBundle } from './persist'
import {
  decide,
  decision,
  HOUR,
  ORG,
  ownerStep,
  RUN,
  seed,
  state,
  T0,
} from './test/approval-notification-fixture'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function run(
  db: D1Database,
  step: DriveStep,
  awaitApproval: AwaitApprovalPort,
  approvalNotifications: ApprovalNotificationPorts,
) {
  return runApproveStep({
    step,
    awaitApproval,
    approvalNotifications,
    taskId: 'gate',
    timeoutHours: 1,
    io: {
      db,
      ids: { orgId: ORG, runId: RUN },
      taskIds: ['gate', 'echo_hello'],
      load: loadRun,
      persist: persistBundle,
    },
  })
}

describe('approval notification replay and timing', () => {
  it('replays recorded steps after interruption with stable notification identity', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)
    const db = await seed(undefined, 'running')
    const cache = new Map<string, unknown>()
    const firstNames: string[] = []
    const replayNames: string[] = []
    const notices: unknown[] = []
    let interrupted = false
    const ports: ApprovalNotificationPorts = {
      opened: async (notice) => {
        notices.push(['opened', notice])
      },
      closed: async (notice) => {
        notices.push(['closed', notice])
      },
    }
    const wait: AwaitApprovalPort = async (taskId, _remaining, attempt) => {
      const key = `approval:${taskId}:${attempt}`
      if (cache.has(key)) return cache.get(key) as 'event'
      await decide(db, taskId, 'approved')
      cache.set(key, 'event')
      return 'event'
    }
    await expect(
      run(
        db,
        ownerStep({
          cache,
          names: firstNames,
          before: async (name) => {
            if (name === 'approve:read:gate:0' && !interrupted) {
              interrupted = true
              throw new Error('owner interrupted')
            }
          },
        }),
        wait,
        ports,
      ),
    ).rejects.toThrow('owner interrupted')
    expect((await state(db)).tasks.gate?.outcome).toBe('waiting')
    vi.setSystemTime(T0 + 10 * 60_000)
    await run(db, ownerStep({ cache, names: replayNames }), wait, ports)
    const identity = { orgId: ORG, runId: RUN, taskId: 'gate' }
    expect(firstNames).toContain('approve:notification:opened:gate')
    expect(replayNames).toContain('approve:notification:opened:gate')
    expect(replayNames).toContain('approve:notification:closed:gate')
    expect(notices).toEqual([
      ['opened', identity],
      ['closed', { ...identity, outcome: 'approved' }],
    ])
    expect(await decision(db)).toEqual({ decision: 'approved' })
    expect((await state(db)).tasks.gate?.outcome).toBe('ok')
  })

  it('does not notify when the approval receipt is already terminal', async () => {
    const db = await seed(undefined, 'running')
    await run(
      db,
      ownerStep(),
      async () => {
        await decide(db, 'gate', 'approved')
        return 'event'
      },
      {},
    )
    const notices: unknown[] = []
    await run(
      db,
      ownerStep(),
      async () => {
        throw new Error('terminal approval must not wait')
      },
      {
        opened: async (notice) => {
          notices.push(notice)
        },
        closed: async (notice) => {
          notices.push(notice)
        },
      },
    )
    expect(notices).toEqual([])
    expect((await state(db)).tasks.gate?.outcome).toBe('ok')
  })

  it('keeps the original deadline and eight-wake budget when opened notifications exhaust', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)
    const db = await seed(undefined, 'running')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const waits: Array<[number, number]> = []
    let attempts = 0
    const closed: unknown[] = []
    await run(
      db,
      ownerStep(),
      async (_task, remaining, attempt) => {
        waits.push([attempt, remaining])
        vi.setSystemTime(T0 + 10 * 60_000 + (attempt + 1) * 5 * 60_000)
        return 'event'
      },
      {
        opened: async () => {
          attempts++
          vi.setSystemTime(T0 + 10 * 60_000)
          throw new Error('private callback error')
        },
        closed: async (notice) => {
          closed.push(notice)
        },
      },
    )
    expect(attempts).toBe(4)
    expect(waits).toEqual(
      Array.from({ length: 8 }, (_, attempt) => [
        attempt,
        HOUR - 10 * 60_000 - attempt * 5 * 60_000,
      ]),
    )
    expect(await decision(db)).toEqual({ decision: 'expired' })
    expect((await state(db)).tasks.gate).toMatchObject({
      outcome: 'fail',
      errorCode: 'APPROVAL_TIMEOUT',
    })
    expect(closed).toEqual([{ orgId: ORG, runId: RUN, taskId: 'gate', outcome: 'expired' }])
    expect(log).toHaveBeenCalledTimes(1)
  })
})
