import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  kitNotificationDeliveries,
  kitNotificationOrganizationDeliveries,
  kitNotifications,
} from '../drizzle-schema'
import {
  admitNotifications,
  finishDelivery,
  purgeNotifications,
  recordDeliveryAdmissionObservation,
} from '../repos'
import { admission, identities } from '../test/admit-fixtures'
import { createMemoryD1 } from '../test/memory-d1'

describe('notification retention', () => {
  it('purges bounded scoped batches at terminal and intent cutoffs, including uncertain owners', async () => {
    const { db } = createMemoryD1()
    const old = admission({
      now: 1000,
      users: [
        {
          id: 'n-old',
          userId: 'alice',
          deliveries: [
            { id: 'u_unknown', channel: 'email' },
            { id: 'u_expired', channel: 'slack' },
          ],
        },
      ],
      organizations: [
        { id: 'o_old', destinationId: 'd1', channel: 'slack' },
        { id: 'o_terminal', destinationId: 'd2', channel: 'slack' },
      ],
    })
    const refs = identities(old)
    await admitNotifications(db, old, refs)
    await recordDeliveryAdmissionObservation(db, {
      ref: refs[0]!.ref,
      workflowId: refs[0]!.workflowId,
      observedAt: 2000,
      observation: { kind: 'unknown' },
    })
    await recordDeliveryAdmissionObservation(db, {
      ref: refs[1]!.ref,
      workflowId: refs[1]!.workflowId,
      observedAt: 86_401_000,
      observation: { kind: 'expired' },
    })
    await finishDelivery(db, refs[3]!.ref, { status: 'failed', code: 'provider_error' }, 3000)
    const newer = admission({
      now: 1001,
      source: { kind: 'task', id: 'other' },
      users: [
        { id: 'n-new', userId: 'alice', deliveries: [{ id: 'u_terminal', channel: 'email' }] },
      ],
      organizations: [{ id: 'o_new', destinationId: 'd1', channel: 'slack' }],
    })
    const more = identities(newer, 10)
    await admitNotifications(db, newer, more)
    await finishDelivery(db, more[0]!.ref, { status: 'sent' }, 3001)
    const foreign = admission({
      orgId: 'org-b',
      users: [
        { id: 'n-foreign', userId: 'bob', deliveries: [{ id: 'u_foreign', channel: 'email' }] },
      ],
    })
    await admitNotifications(db, foreign, identities(foreign, 20))
    const base = {
      orgId: 'org-a',
      now: 100_000_000,
      notificationCutoff: 1000,
      deliveryCutoff: 3000,
      batchSize: 10,
    }
    expect(await purgeNotifications(db, base)).toEqual({
      notifications: 1,
      deliveries: 0,
      organizationDeliveries: 2,
    })
    expect((await db.select().from(kitNotifications)).map((row) => row.id).sort()).toEqual([
      'n-foreign',
      'n-new',
    ])
    expect((await db.select().from(kitNotificationDeliveries)).map((row) => row.id).sort()).toEqual(
      ['u_foreign', 'u_terminal'],
    )
    expect(
      (await db.select().from(kitNotificationOrganizationDeliveries)).map((row) => row.id),
    ).toEqual(['o_new'])
    expect(
      (
        await db
          .select()
          .from(kitNotificationDeliveries)
          .where(eq(kitNotificationDeliveries.id, 'u_terminal'))
      )[0]?.status,
    ).toBe('sent')
    expect(
      await purgeNotifications(db, {
        ...base,
        notificationCutoff: 1001,
        deliveryCutoff: 3001,
        batchSize: 1,
      }),
    ).toEqual({ notifications: 1, deliveries: 1, organizationDeliveries: 1 })
  })
  it('terminalizes only selected children before cascade and preserves terminal receipts', async () => {
    const { db, sqlite } = createMemoryD1()
    sqlite.exec(
      'CREATE TABLE deleted_deliveries (id TEXT, org_id TEXT, notification_id TEXT, status TEXT, error_code TEXT, finished_at INTEGER)',
    )
    sqlite.exec(
      'CREATE TRIGGER observe_delivery_delete BEFORE DELETE ON kit_notification_deliveries BEGIN INSERT INTO deleted_deliveries VALUES (OLD.id, OLD.org_id, OLD.notification_id, OLD.status, OLD.error_code, OLD.finished_at); END',
    )
    const batch = admission({
      users: [
        {
          id: 'n-a',
          userId: 'a',
          deliveries: [
            { id: 'u_pending', channel: 'email' },
            { id: 'u_sent', channel: 'slack' },
            { id: 'u_failed', channel: 'webhook' },
            { id: 'u_skipped', channel: 'push' },
          ],
        },
        { id: 'n-b', userId: 'b', deliveries: [{ id: 'u_b', channel: 'email' }] },
        { id: 'n-c', userId: 'c', deliveries: [{ id: 'u_c', channel: 'email' }] },
      ],
    })
    const refs = identities(batch)
    await admitNotifications(db, batch, refs)
    await finishDelivery(db, refs[1]!.ref, { status: 'sent' }, 1500)
    await finishDelivery(db, refs[2]!.ref, { status: 'failed', code: 'provider_error' }, 1501)
    await finishDelivery(db, refs[3]!.ref, { status: 'skipped', code: 'denied' }, 1502)
    const foreign = admission({
      orgId: 'org-b',
      users: [
        { id: 'n-foreign', userId: 'other', deliveries: [{ id: 'u_foreign', channel: 'email' }] },
      ],
    })
    await admitNotifications(db, foreign, identities(foreign, 20))
    const input = {
      orgId: 'org-a',
      now: 5000,
      notificationCutoff: 1000,
      deliveryCutoff: 1000,
      batchSize: 1,
    }
    expect(await purgeNotifications(db, input)).toEqual({
      notifications: 1,
      deliveries: 0,
      organizationDeliveries: 0,
    })
    expect(sqlite.prepare('SELECT * FROM deleted_deliveries ORDER BY id').all()).toEqual([
      {
        id: 'u_failed',
        org_id: 'org-a',
        notification_id: 'n-a',
        status: 'failed',
        error_code: 'provider_error',
        finished_at: 1501,
      },
      {
        id: 'u_pending',
        org_id: 'org-a',
        notification_id: 'n-a',
        status: 'skipped',
        error_code: 'notification_expired',
        finished_at: 5000,
      },
      {
        id: 'u_sent',
        org_id: 'org-a',
        notification_id: 'n-a',
        status: 'sent',
        error_code: null,
        finished_at: 1500,
      },
      {
        id: 'u_skipped',
        org_id: 'org-a',
        notification_id: 'n-a',
        status: 'skipped',
        error_code: 'denied',
        finished_at: 1502,
      },
    ])
    expect(
      sqlite
        .prepare(
          'SELECT id, status, error_code, finished_at FROM kit_notification_deliveries ORDER BY id',
        )
        .all(),
    ).toEqual([
      { id: 'u_b', status: 'pending', error_code: null, finished_at: null },
      { id: 'u_c', status: 'pending', error_code: null, finished_at: null },
      { id: 'u_foreign', status: 'pending', error_code: null, finished_at: null },
    ])
    expect(await purgeNotifications(db, input)).toEqual({
      notifications: 1,
      deliveries: 0,
      organizationDeliveries: 0,
    })
    expect(await purgeNotifications(db, input)).toEqual({
      notifications: 1,
      deliveries: 0,
      organizationDeliveries: 0,
    })
    expect(
      sqlite
        .prepare(
          "SELECT notification_id, status, error_code, finished_at FROM deleted_deliveries WHERE id IN ('u_b','u_c') ORDER BY id",
        )
        .all(),
    ).toEqual([
      {
        notification_id: 'n-b',
        status: 'skipped',
        error_code: 'notification_expired',
        finished_at: 5000,
      },
      {
        notification_id: 'n-c',
        status: 'skipped',
        error_code: 'notification_expired',
        finished_at: 5000,
      },
    ])
    expect((await db.select().from(kitNotifications)).map((row) => row.id)).toEqual(['n-foreign'])
  })

  it('rolls back child terminalization and earlier retention deletes when parent deletion fails', async () => {
    const { db, sqlite } = createMemoryD1()
    const batch = admission({
      users: [
        {
          id: 'n-a',
          userId: 'a',
          deliveries: [
            { id: 'u_pending', channel: 'email' },
            { id: 'u_terminal', channel: 'slack' },
          ],
        },
      ],
      organizations: [{ id: 'o_old', destinationId: 'd1', channel: 'slack' }],
    })
    const refs = identities(batch)
    await admitNotifications(db, batch, refs)
    await finishDelivery(db, refs[1]!.ref, { status: 'sent' }, 1200)
    sqlite.exec(
      'CREATE TABLE deleted_deliveries (id TEXT, status TEXT, error_code TEXT, finished_at INTEGER)',
    )
    sqlite.exec(
      'CREATE TRIGGER observe_delivery_delete BEFORE DELETE ON kit_notification_deliveries BEGIN INSERT INTO deleted_deliveries VALUES (OLD.id, OLD.status, OLD.error_code, OLD.finished_at); END',
    )
    sqlite.exec(
      "CREATE TRIGGER reject_notification_delete BEFORE DELETE ON kit_notifications BEGIN SELECT RAISE(ABORT, 'retention failure'); END",
    )
    await expect(
      purgeNotifications(db, {
        orgId: 'org-a',
        now: 5000,
        notificationCutoff: 1000,
        deliveryCutoff: 1200,
        batchSize: 10,
      }),
    ).rejects.toThrow()
    expect(
      sqlite
        .prepare(
          'SELECT id, status, error_code, finished_at FROM kit_notification_deliveries ORDER BY id',
        )
        .all(),
    ).toEqual([
      { id: 'u_pending', status: 'pending', error_code: null, finished_at: null },
      { id: 'u_terminal', status: 'sent', error_code: null, finished_at: 1200 },
    ])
    expect(sqlite.prepare('SELECT * FROM deleted_deliveries').all()).toEqual([])
    expect((await db.select().from(kitNotifications)).map((row) => row.id)).toEqual(['n-a'])
    expect(
      (await db.select().from(kitNotificationOrganizationDeliveries)).map((row) => row.id),
    ).toEqual(['o_old'])
  })
})
