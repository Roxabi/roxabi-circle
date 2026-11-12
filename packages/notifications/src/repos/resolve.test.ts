import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { kitNotificationOrganizationDeliveries, kitNotifications } from '../drizzle-schema'
import {
  admitNotifications,
  finishDelivery,
  loadDelivery,
  markRead,
  resolveNotifications,
} from '../repos'
import { admission, identities } from '../test/admit-fixtures'
import { createMemoryD1 } from '../test/memory-d1'

describe('notification resolution', () => {
  it('preserves read independence, restricts user resolution, and allows re-emission', async () => {
    const { db } = createMemoryD1()
    const batch = admission({
      users: [
        { id: 'n1', userId: 'alice', deliveries: [{ id: 'u_a', channel: 'email' }] },
        { id: 'n2', userId: 'bob', deliveries: [{ id: 'u_b', channel: 'email' }] },
      ],
      organizations: [{ id: 'o_a', destinationId: 'dest', channel: 'slack' }],
    })
    const refs = identities(batch)
    await admitNotifications(db, batch, refs)
    await markRead(
      db,
      { orgId: 'org-a', userId: 'bob', readableModuleIds: [] },
      { id: 'n2', now: 1100 },
    )
    expect(
      await resolveNotifications(db, { orgId: 'other', source: batch.source, now: 1200 }),
    ).toEqual({ resolvedNotifications: 0, skippedDeliveries: 0, resolvedOrganizationDeliveries: 0 })
    expect(
      await resolveNotifications(db, {
        orgId: batch.orgId,
        source: batch.source,
        userIds: [],
        now: 1200,
      }),
    ).toEqual({ resolvedNotifications: 0, skippedDeliveries: 0, resolvedOrganizationDeliveries: 0 })
    expect(
      await resolveNotifications(db, {
        orgId: batch.orgId,
        source: batch.source,
        types: [],
        now: 1200,
      }),
    ).toEqual({ resolvedNotifications: 0, skippedDeliveries: 0, resolvedOrganizationDeliveries: 0 })
    expect(
      await resolveNotifications(db, {
        orgId: batch.orgId,
        source: batch.source,
        userIds: ['alice'],
        now: 1200,
      }),
    ).toEqual({ resolvedNotifications: 1, skippedDeliveries: 1, resolvedOrganizationDeliveries: 0 })
    const alice = (
      await db.select().from(kitNotifications).where(eq(kitNotifications.id, 'n1'))
    )[0]!
    const bob = (await db.select().from(kitNotifications).where(eq(kitNotifications.id, 'n2')))[0]!
    expect([alice.readAt, alice.resolvedAt, bob.readAt, bob.resolvedAt]).toEqual([
      null,
      1200,
      1100,
      null,
    ])
    expect(
      (await db.select().from(kitNotificationOrganizationDeliveries))[0]?.resolvedAt,
    ).toBeNull()
    const repeat = admission({
      users: [{ id: 'n3', userId: 'alice', deliveries: [{ id: 'u_c', channel: 'email' }] }],
    })
    expect(
      (await admitNotifications(db, repeat, identities(repeat, 50))).createdNotificationIds,
    ).toEqual(['n3'])
    expect(await finishDelivery(db, refs[2]!.ref, { status: 'sent' }, 1250)).toBe(true)
    const complete = await resolveNotifications(db, {
      orgId: batch.orgId,
      source: batch.source,
      types: [batch.type],
      now: 1300,
    })
    expect(complete).toEqual({
      resolvedNotifications: 2,
      skippedDeliveries: 2,
      resolvedOrganizationDeliveries: 1,
    })
    expect((await loadDelivery(db, refs[2]!.ref))?.status).toBe('sent')
    expect((await db.select().from(kitNotificationOrganizationDeliveries))[0]?.resolvedAt).toBe(
      1300,
    )
  })

  it('intersects bound predicates with mandatory scope and updates each lifecycle pair together', async () => {
    const { db } = createMemoryD1()
    const batch = admission({
      users: [
        { id: 'n1', userId: 'alice', deliveries: [{ id: 'u_a', channel: 'email' }] },
        { id: 'n2', userId: 'bob', deliveries: [{ id: 'u_b', channel: 'email' }] },
      ],
      organizations: [{ id: 'o_a', destinationId: 'dest', channel: 'slack' }],
    })
    const refs = identities(batch)
    await admitNotifications(db, batch, refs)
    const other = admission({
      orgId: 'org-b',
      users: [{ id: 'n3', userId: 'alice', deliveries: [{ id: 'u_c', channel: 'email' }] }],
      organizations: [{ id: 'o_b', destinationId: 'dest2', channel: 'slack' }],
    })
    await admitNotifications(db, other, identities(other, 20))
    await markRead(
      db,
      { orgId: 'org-a', userId: 'alice', readableModuleIds: [] },
      { id: 'n1', now: 1100 },
    )
    const guard = {
      notifications: sql`${kitNotifications.userId} = ${'alice'} OR ${'x'} = ${'never'}`,
      organizationDeliveries: sql`${kitNotificationOrganizationDeliveries.destinationId} = ${'not-dest'}`,
    }
    const scope = { orgId: batch.orgId, source: batch.source, now: 1200 }
    expect(await resolveNotifications(db, { ...scope, userIds: [] }, guard)).toEqual({
      resolvedNotifications: 0,
      skippedDeliveries: 0,
      resolvedOrganizationDeliveries: 0,
    })
    expect(await resolveNotifications(db, { ...scope, types: ['other.type'] }, guard)).toEqual({
      resolvedNotifications: 0,
      skippedDeliveries: 0,
      resolvedOrganizationDeliveries: 0,
    })
    expect(await resolveNotifications(db, { ...scope, userIds: ['bob'] }, guard)).toEqual({
      resolvedNotifications: 0,
      skippedDeliveries: 0,
      resolvedOrganizationDeliveries: 0,
    })
    expect(await resolveNotifications(db, scope, guard)).toEqual({
      resolvedNotifications: 1,
      skippedDeliveries: 1,
      resolvedOrganizationDeliveries: 0,
    })
    const alice = (
      await db.select().from(kitNotifications).where(eq(kitNotifications.id, 'n1'))
    )[0]!
    expect([alice.readAt, alice.resolvedAt]).toEqual([1100, 1200])
    expect((await loadDelivery(db, refs[0]!.ref))?.status).toBe('skipped')
    expect((await loadDelivery(db, refs[1]!.ref))?.status).toBe('pending')
    expect((await loadDelivery(db, refs[2]!.ref))?.status).toBe('pending')
    const unrelated = (
      await db.select().from(kitNotifications).where(eq(kitNotifications.id, 'n3'))
    )[0]!
    expect(unrelated.resolvedAt).toBeNull()
    expect((await loadDelivery(db, identities(other, 20)[0]!.ref))?.status).toBe('pending')
    await finishDelivery(db, refs[1]!.ref, { status: 'sent' }, 1250)
    const allow = {
      notifications: sql`${1} = ${1}`,
      organizationDeliveries: sql`${kitNotificationOrganizationDeliveries.destinationId} = ${'dest'}`,
    }
    expect(
      await resolveNotifications(db, { ...scope, now: 1300, userIds: ['bob'] }, allow),
    ).toEqual({
      resolvedNotifications: 1,
      skippedDeliveries: 0,
      resolvedOrganizationDeliveries: 0,
    })
    expect((await loadDelivery(db, refs[1]!.ref))?.status).toBe('sent')
    expect(await resolveNotifications(db, { ...scope, now: 1400 }, allow)).toEqual({
      resolvedNotifications: 0,
      skippedDeliveries: 1,
      resolvedOrganizationDeliveries: 1,
    })
    expect((await loadDelivery(db, refs[2]!.ref))?.status).toBe('skipped')
    expect((await loadDelivery(db, identities(other, 20)[1]!.ref))?.status).toBe('pending')
  })
})
