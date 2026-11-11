import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { describe, expect, it } from 'vitest'
import {
  kitNotificationDeliveries,
  kitNotificationOrganizationDeliveries,
  kitNotifications,
} from '../drizzle-schema'
import {
  finishDelivery,
  listDeliveryMetadata,
  listDeploymentFailures,
  loadDelivery,
  recordAttempt,
  recordRetryableFailure,
} from '../repos'
import { createMemoryD1 } from '../test/memory-d1'

const common = {
  channel: 'email',
  status: 'pending',
  createdAt: 1,
  admissionStatus: 'pending',
  admissionDeadlineAt: 86400001,
}
const workflow = (digit: string) => `nd-v1-${digit.repeat(64)}`
const user = { orgId: 'org', kind: 'user' as const, id: 'u_a' }
const collective = { orgId: 'org', kind: 'organization' as const, id: 'o_a' }

async function seed(db: DrizzleD1Database<Record<string, unknown>>) {
  await db.insert(kitNotifications).values([
    {
      id: 'n',
      orgId: 'org',
      userId: 'user',
      typeKey: 'task',
      sourceKind: 'kind',
      sourceId: '秘密',
      paramsJson: '{"private":"内容"}',
      createdAt: 1,
    },
    {
      id: 'f',
      orgId: 'foreign',
      userId: 'other',
      typeKey: 'task',
      sourceKind: 'kind',
      sourceId: 'f',
      paramsJson: '{}',
      createdAt: 1,
    },
  ])
  await db.insert(kitNotificationDeliveries).values([
    { ...common, id: 'u_a', orgId: 'org', notificationId: 'n', workflowId: workflow('a') },
    { ...common, id: 'u_f', orgId: 'foreign', notificationId: 'f', workflowId: workflow('b') },
  ])
  await db.insert(kitNotificationOrganizationDeliveries).values({
    ...common,
    id: 'o_a',
    orgId: 'org',
    destinationId: 'dest',
    typeKey: 'task',
    sourceKind: 'kind',
    sourceId: '秘密',
    paramsJson: '{"private":"内容"}',
    workflowId: workflow('c'),
  })
}

describe('delivery storage', () => {
  it('guards attempts and preserves the first terminal receipt', async () => {
    const { db } = createMemoryD1()
    await seed(db)
    expect(await loadDelivery(db, { ...user, orgId: 'foreign' })).toBeNull()
    expect(await recordAttempt(db, { ...user, orgId: 'foreign' }, 2)).toBe(false)
    expect(await recordAttempt(db, user, 2)).toBe(true)
    expect(await recordAttempt(db, user, 3)).toBe(true)
    expect(await recordRetryableFailure(db, user, 'temporary', 4)).toBe(true)
    expect((await loadDelivery(db, user))?.attemptCount).toBe(2)
    expect(await finishDelivery(db, user, { status: 'failed', code: 'permanent' }, 5)).toBe(true)
    expect(await finishDelivery(db, user, { status: 'sent' }, 6)).toBe(false)
    expect(await recordAttempt(db, user, 7)).toBe(false)
    expect(await recordRetryableFailure(db, user, 'late', 7)).toBe(false)
    expect(await loadDelivery(db, user)).toMatchObject({
      status: 'failed',
      errorCode: 'permanent',
      finishedAt: 5,
      params: { private: '内容' },
      userId: 'user',
    })
    expect(await recordAttempt(db, collective, 2)).toBe(true)
    expect(await finishDelivery(db, collective, { status: 'skipped', code: 'closed' }, 3)).toBe(
      true,
    )
    expect(await recordAttempt(db, collective, 4)).toBe(false)
  })
  it('unifies scoped metadata before paging and forces deployment failures', async () => {
    const { db } = createMemoryD1()
    await seed(db)
    await finishDelivery(db, user, { status: 'failed', code: 'bad' }, 5)
    await finishDelivery(db, { orgId: 'foreign', kind: 'user', id: 'u_f' }, { status: 'failed' }, 5)
    const one = await listDeliveryMetadata(db, { orgId: 'org' }, { limit: 1 })
    const two = await listDeliveryMetadata(
      db,
      { orgId: 'org' },
      { limit: 1, cursor: one.nextCursor! },
    )
    expect([...one.items, ...two.items].map((x) => x.id)).toEqual(['u_a', 'o_a'])
    expect(two.nextCursor).toBeNull()
    expect(one.items[0]).not.toHaveProperty('params')
    expect(one.items[0]).not.toHaveProperty('orgId')
    expect(one.items[0]).not.toHaveProperty('externalId')
    expect(Object.keys(one.items[0]!).sort()).toEqual(
      [
        'admissionStatus',
        'attemptCount',
        'channel',
        'createdAt',
        'destinationId',
        'errorCode',
        'finishedAt',
        'id',
        'status',
        'targetKind',
        'type',
        'userId',
      ].sort(),
    )
    expect(Object.keys((await listDeploymentFailures(db, {})).items[0]!).sort()).toEqual(
      [
        'admissionStatus',
        'attemptCount',
        'channel',
        'createdAt',
        'destinationId',
        'errorCode',
        'finishedAt',
        'id',
        'orgId',
        'status',
        'targetKind',
        'type',
        'userId',
      ].sort(),
    )
    expect(
      (
        await listDeliveryMetadata(
          db,
          { orgId: 'org' },
          { status: 'pending', targetKind: 'organization', channel: 'email', type: 'task' },
        )
      ).items.map((x) => x.id),
    ).toEqual(['o_a'])
    expect((await listDeploymentFailures(db, {})).items.map((x) => x.id)).toEqual(['u_f', 'u_a'])
    expect((await listDeploymentFailures(db, { status: 'pending' })).items).toEqual([])
    await expect(
      listDeliveryMetadata(db, { orgId: 'org' }, { q: 'search' } as never),
    ).rejects.toThrow()
  })
  it('pages maximum-length ASCII identifiers within the selected organization', async () => {
    const { db } = createMemoryD1()
    await seed(db)
    const id = `u_${'z'.repeat(254)}`
    await db.insert(kitNotifications).values({
      id: 'long',
      orgId: 'org',
      userId: 'user',
      typeKey: 'task',
      sourceKind: 'kind',
      sourceId: 'long',
      paramsJson: '{}',
      createdAt: 1,
    })
    await db
      .insert(kitNotificationDeliveries)
      .values({ ...common, id, orgId: 'org', notificationId: 'long', workflowId: workflow('d') })
    const first = await listDeliveryMetadata(db, { orgId: 'org' }, { limit: 1 })
    expect(first.items[0]?.id).toBe(id)
    expect(first.nextCursor!.length).toBeLessThanOrEqual(512)
    const next = await listDeliveryMetadata(
      db,
      { orgId: 'org' },
      { limit: 1, cursor: first.nextCursor! },
    )
    expect(next.items[0]?.id).toBe('u_a')
  })
})
