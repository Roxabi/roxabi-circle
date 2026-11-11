import { createDb } from '@kit/db'
import type { DeliveryRef } from '@kit/notifications'
import { loadDelivery } from '@kit/notifications/repos'
import {
  kitNotificationDeliveries,
  kitNotificationOrganizationDeliveries,
  kitNotifications,
} from '@kit/notifications/schema'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { schema } from '../db/schema'
import { deliveryWorkflowId } from '../services/notifications/delivery-identity'
import { createMemoryEnv } from '../test/memory-env'
import { createNotificationDeliveryRuntime } from './admission'

const deadline = 86_400_000

describe('notification delivery admission', () => {
  function fixture() {
    const env = createMemoryEnv()
    const db = createDb(env.DB as unknown as D1Database, schema)
    let time = 120_000
    const get = vi.fn(
      async (_id: string): Promise<{ status(): Promise<{ status: string; output?: unknown }> }> => {
        throw new Error('unavailable')
      },
    )
    const create = vi.fn(async (_input: { id: string; params: DeliveryRef }): Promise<void> => {})
    const binding = { get, create } as unknown as Workflow<DeliveryRef>
    const runtime = createNotificationDeliveryRuntime(
      db,
      { NOTIFICATION_DELIVERY: binding },
      () => time,
    )
    async function seed(
      id: string,
      options: {
        orgId?: string
        kind?: DeliveryRef['kind']
        channel?: string
        createdAt?: number
      } = {},
    ) {
      const kind = options.kind ?? 'user'
      const ref: DeliveryRef = {
        orgId: options.orgId ?? 'org',
        kind,
        id: `${kind === 'user' ? 'u' : 'o'}_${id}`,
      }
      const createdAt = options.createdAt ?? 0
      const common = {
        id: ref.id,
        orgId: ref.orgId,
        channel: options.channel ?? 'email',
        status: 'pending',
        createdAt,
        workflowId: await deliveryWorkflowId(ref),
        admissionStatus: 'pending',
        admissionDeadlineAt: createdAt + deadline,
        attemptCount: 0,
      }
      if (ref.kind === 'user') {
        await db.insert(kitNotifications).values({
          id: `n_${id}`,
          orgId: ref.orgId,
          userId: 'user',
          typeKey: 'test',
          sourceKind: 'test',
          sourceId: id,
          paramsJson: '{}',
          createdAt,
        })
        await db.insert(kitNotificationDeliveries).values({ ...common, notificationId: `n_${id}` })
      } else {
        await db.insert(kitNotificationOrganizationDeliveries).values({
          ...common,
          destinationId: id,
          typeKey: 'test',
          sourceKind: 'test',
          sourceId: id,
          paramsJson: '{}',
        })
      }
      return ref
    }
    return {
      db,
      runtime,
      get,
      create,
      seed,
      setTime(value: number) {
        time = value
      },
    }
  }

  it('recovers a lost create response by positive lookup without creating another owner', async () => {
    const f = fixture()
    const ref = await f.seed('lost')
    const id = await deliveryWorkflowId(ref)
    let present = false
    f.get.mockImplementation(async () => {
      if (!present) throw new Error('not visible')
      return { status: async () => ({ status: 'running' }) }
    })
    f.create.mockImplementation(async () => {
      present = true
      throw new Error('response lost')
    })
    await f.runtime.ensureDeliveryAdmission(ref)
    await f.runtime.ensureDeliveryAdmission(ref)
    expect(f.create).toHaveBeenCalledTimes(1)
    expect(f.create).toHaveBeenCalledWith({ id, params: ref })
    expect(await loadDelivery(f.db, ref)).toMatchObject({
      status: 'pending',
      admissionStatus: 'admitted',
      workflowId: id,
    })
  })

  it('does not treat an admitted owner with an unavailable lookup as absent', async () => {
    const f = fixture()
    const ref = await f.seed('admitted')
    await f.db
      .update(kitNotificationDeliveries)
      .set({ admissionStatus: 'admitted', admittedAt: 1 })
      .where(eq(kitNotificationDeliveries.id, ref.id))
    await f.runtime.ensureDeliveryAdmission(ref)
    expect(f.create).not.toHaveBeenCalled()
    expect(await loadDelivery(f.db, ref)).toMatchObject({
      status: 'pending',
      admissionStatus: 'admitted',
      admittedAt: 1,
    })
  })
  it('keeps an ambiguous create unknown and retries with the same identity only inside the window', async () => {
    const f = fixture()
    const ref = await f.seed('ambiguous')
    const id = await deliveryWorkflowId(ref)
    f.create.mockRejectedValue(new Error('exists'))
    await f.runtime.ensureDeliveryAdmission(ref)
    expect(await loadDelivery(f.db, ref)).toMatchObject({
      status: 'pending',
      admissionStatus: 'unknown',
    })
    await f.runtime.ensureDeliveryAdmission(ref)
    expect(f.create).toHaveBeenCalledTimes(2)
    expect(f.create).toHaveBeenNthCalledWith(1, { id, params: ref })
    expect(f.create).toHaveBeenNthCalledWith(2, { id, params: ref })
    f.setTime(deadline)
    await f.runtime.ensureDeliveryAdmission(ref)
    expect(f.create).toHaveBeenCalledTimes(2)
    expect(await loadDelivery(f.db, ref)).toMatchObject({
      status: 'pending',
      admissionStatus: 'expired',
    })
  })

  it('never contacts the binding for terminal or mismatched identity rows', async () => {
    const f = fixture()
    const terminal = await f.seed('terminal')
    const mismatch = await f.seed('mismatch')
    await f.db
      .update(kitNotificationDeliveries)
      .set({ status: 'sent', finishedAt: 1 })
      .where(eq(kitNotificationDeliveries.id, terminal.id))
    await f.db
      .update(kitNotificationDeliveries)
      .set({ workflowId: `nd-v1-${'a'.repeat(64)}` })
      .where(eq(kitNotificationDeliveries.id, mismatch.id))
    await f.runtime.ensureDeliveryAdmission(terminal)
    await f.runtime.ensureDeliveryAdmission(mismatch)
    expect(f.get).not.toHaveBeenCalled()
    expect(f.create).not.toHaveBeenCalled()
    expect(await loadDelivery(f.db, terminal)).toMatchObject({ status: 'sent', finishedAt: 1 })
    expect(await loadDelivery(f.db, mismatch)).toMatchObject({
      status: 'pending',
      admissionStatus: 'pending',
    })
  })

  it('rechecks server time after an unsuccessful slow lookup and expires without creating', async () => {
    const f = fixture()
    const ref = await f.seed('slow')
    f.setTime(deadline - 1)
    f.get.mockImplementation(async () => {
      f.setTime(deadline)
      throw new Error('timeout')
    })
    await f.runtime.ensureDeliveryAdmission(ref)
    expect(f.create).not.toHaveBeenCalled()
    expect(await loadDelivery(f.db, ref)).toMatchObject({
      status: 'pending',
      admissionStatus: 'expired',
    })
  })

  it('accepts late positive proof when a concurrent observer expires the row during lookup', async () => {
    const f = fixture()
    const ref = await f.seed('late')
    f.setTime(deadline - 1)
    f.get.mockImplementation(async () => ({
      status: async () => {
        f.setTime(deadline)
        await f.db
          .update(kitNotificationDeliveries)
          .set({ admissionStatus: 'expired' })
          .where(eq(kitNotificationDeliveries.id, ref.id))
        return { status: 'rollingBack' }
      },
    }))
    await f.runtime.ensureDeliveryAdmission(ref)
    expect(f.create).not.toHaveBeenCalled()
    expect(await loadDelivery(f.db, ref)).toMatchObject({
      status: 'pending',
      admissionStatus: 'admitted',
      admittedAt: deadline,
    })
  })

  it.each([
    ['complete', { status: 'sent', code: null }, 'sent', null],
    ['errored', undefined, 'failed', 'delivery_workflow_errored'],
    ['terminated', undefined, 'failed', 'delivery_workflow_terminated'],
  ])('projects observed %s to the pending receipt', async (status, output, result, code) => {
    const f = fixture()
    const ref = await f.seed('projection')
    f.get.mockResolvedValue({ status: async () => ({ status, output }) })
    await f.runtime.ensureDeliveryAdmission(ref)
    expect(f.create).not.toHaveBeenCalled()
    expect(await loadDelivery(f.db, ref)).toMatchObject({
      admissionStatus: 'admitted',
      status: result,
      errorCode: code,
    })
  })

  it('does not project invalid completion output or overwrite a concurrent terminal receipt', async () => {
    const f = fixture()
    const invalid = await f.seed('invalid')
    f.get.mockResolvedValue({
      status: async () => ({
        status: 'complete',
        output: { status: 'sent', code: null, secret: 'private' },
      }),
    })
    await f.runtime.ensureDeliveryAdmission(invalid)
    expect(await loadDelivery(f.db, invalid)).toMatchObject({
      status: 'pending',
      admissionStatus: 'admitted',
    })
    const raced = await f.seed('raced')
    f.get.mockResolvedValue({
      status: async () => {
        await f.db
          .update(kitNotificationDeliveries)
          .set({ status: 'skipped', errorCode: 'resolved', finishedAt: 5 })
          .where(eq(kitNotificationDeliveries.id, raced.id))
        return { status: 'complete', output: { status: 'sent', code: null } }
      },
    })
    await f.runtime.ensureDeliveryAdmission(raced)
    expect(await loadDelivery(f.db, raced)).toMatchObject({
      status: 'skipped',
      errorCode: 'resolved',
      finishedAt: 5,
    })
    expect(f.create).not.toHaveBeenCalled()
  })

  it.each([
    ['user', 'slack'],
    ['organization', 'email'],
    ['organization', 'slack'],
  ] as const)('keeps unsupported %s/%s pending until admission expires', async (kind, channel) => {
    const f = fixture()
    const ref = await f.seed('unsupported', { kind, channel })
    await f.runtime.ensureDeliveryAdmission(ref)
    expect(await loadDelivery(f.db, ref)).toMatchObject({
      status: 'pending',
      admissionStatus: 'unknown',
    })
    f.setTime(deadline)
    await f.runtime.ensureDeliveryAdmission(ref)
    expect(await loadDelivery(f.db, ref)).toMatchObject({
      status: 'pending',
      admissionStatus: 'expired',
    })
    expect(f.get).not.toHaveBeenCalled()
    expect(f.create).not.toHaveBeenCalled()
  })

  it('reconciles only the requested organization and one bounded page of old intentions', async () => {
    const f = fixture()
    const first = await f.seed('first')
    const second = await f.seed('second')
    const foreign = await f.seed('foreign', { orgId: 'foreign' })
    const recent = await f.seed('recent', { createdAt: 119_999 })
    await f.runtime.reconcileDeliveryAdmissions({ orgId: 'org', now: 120_000, limit: 1 })
    const rows = await Promise.all(
      [first, second, foreign, recent].map((ref) => loadDelivery(f.db, ref)),
    )
    expect(rows.slice(0, 2).filter((row) => row?.admissionStatus === 'admitted')).toHaveLength(1)
    expect(rows.slice(0, 2).filter((row) => row?.admissionStatus === 'pending')).toHaveLength(1)
    expect(rows[2]).toMatchObject({ admissionStatus: 'pending' })
    expect(rows[3]).toMatchObject({ admissionStatus: 'pending' })
    expect(f.create).toHaveBeenCalledTimes(1)
  })
})
