import { createDb } from '@kit/db'
import type { DeliveryRef } from '@kit/notifications'
import { loadDelivery } from '@kit/notifications/repos'
import { kitNotificationDeliveries, kitNotifications } from '@kit/notifications/schema'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { schema } from '../db/schema'
import { deliveryWorkflowId } from '../services/notifications/delivery-identity'
import { createMemoryEnv } from '../test/memory-env'
import { notificationDeliveryRetryDelay } from './retry'
import { handleRetryable } from './retry-attempt'

async function fixture() {
  const env = createMemoryEnv()
  const db = createDb(env.DB as unknown as D1Database, schema)
  const ref: DeliveryRef = { kind: 'user', orgId: 'org', id: 'u_delivery' }
  await db.insert(kitNotifications).values({
    id: 'notification',
    orgId: ref.orgId,
    userId: 'user',
    typeKey: 'test',
    sourceKind: 'test',
    sourceId: 'source',
    paramsJson: '{}',
    createdAt: 0,
  })
  await db.insert(kitNotificationDeliveries).values({
    id: ref.id,
    orgId: ref.orgId,
    notificationId: 'notification',
    channel: 'email',
    status: 'pending',
    createdAt: 0,
    workflowId: await deliveryWorkflowId(ref),
    admissionStatus: 'pending',
    admissionDeadlineAt: 86_400_000,
    attemptCount: 0,
  })
  return { env, db, ref }
}

async function rejectedError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    return error as Error
  }
  throw new Error('Expected rejection')
}

describe('retryable delivery attempt', () => {
  it('preserves the private fractional hint when the diagnostic update is rejected', async () => {
    const { env, db, ref } = await fixture()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await env.DB.exec(
        "CREATE TRIGGER reject_retry_diagnostic BEFORE UPDATE ON kit_notification_deliveries BEGIN SELECT RAISE(ABORT, 'rejected'); END",
      )
      await expect(
        db
          .update(kitNotificationDeliveries)
          .set({ errorCode: 'probe' })
          .where(eq(kitNotificationDeliveries.id, ref.id)),
      ).rejects.toThrow()
      const before = await loadDelivery(db, ref)
      const error = await rejectedError(
        handleRetryable(db, ref, {
          status: 'retryable',
          code: 'rate_limited',
          retryAfterSeconds: 75.25,
        }),
      )
      expect(JSON.parse(error.message)).toEqual({ code: 'rate_limited', retryAfterSeconds: 75.25 })
      const ctx = { attempt: 1 } as Parameters<typeof notificationDeliveryRetryDelay>[0]['ctx']
      expect(notificationDeliveryRetryDelay({ ctx, error })).toBe(76_000)
      expect(log).toHaveBeenCalledTimes(1)
      expect(await loadDelivery(db, ref)).toEqual(before)
    } finally {
      log.mockRestore()
      env.close()
    }
  })

  it('fails above the budget without attempting a diagnostic update', async () => {
    const { env, db, ref } = await fixture()
    try {
      await env.DB.exec('CREATE TABLE retry_update_observations (id TEXT)')
      await env.DB.exec(
        'CREATE TRIGGER observe_retry_update AFTER UPDATE ON kit_notification_deliveries BEGIN INSERT INTO retry_update_observations VALUES (NEW.id); END',
      )
      const before = await loadDelivery(db, ref)
      expect(
        await handleRetryable(db, ref, {
          status: 'retryable',
          code: 'rate_limited',
          retryAfterSeconds: 86_400.01,
        }),
      ).toEqual({ status: 'failed', code: 'retry_after_exceeds_budget' })
      expect(await loadDelivery(db, ref)).toEqual(before)
      expect(await env.DB.prepare('SELECT id FROM retry_update_observations').all()).toMatchObject({
        results: [],
      })
    } finally {
      env.close()
    }
  })

  it('accepts the budget boundary and records the diagnostic', async () => {
    const { env, db, ref } = await fixture()
    try {
      const error = await rejectedError(
        handleRetryable(db, ref, {
          status: 'retryable',
          code: 'rate_limited',
          retryAfterSeconds: 86_400,
        }),
      )
      expect(JSON.parse(error.message)).toEqual({ code: 'rate_limited', retryAfterSeconds: 86_400 })
      const ctx = { attempt: 1 } as Parameters<typeof notificationDeliveryRetryDelay>[0]['ctx']
      expect(notificationDeliveryRetryDelay({ ctx, error })).toBe(86_400_000)
      expect(await loadDelivery(db, ref)).toMatchObject({
        status: 'pending',
        errorCode: 'rate_limited',
        lastAttemptAt: expect.any(Number),
      })
    } finally {
      env.close()
    }
  })
})
