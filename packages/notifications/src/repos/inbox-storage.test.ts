import { encodeListCursor } from '@kit/core'
import { describe, expect, it } from 'vitest'
import { kitNotifications } from '../drizzle-schema'
import { countUnread, hasInboxNotification, listInbox, markRead } from '../repos'
import { createMemoryD1 } from '../test/memory-d1'

const scope = { orgId: 'org', userId: 'user', readableModuleIds: ['allowed'] }

describe('inbox storage', () => {
  it('filters visibility and ownership before pagination, counts and read-all', async () => {
    const { db, boundParams } = createMemoryD1()
    const base = {
      orgId: 'org',
      userId: 'user',
      typeKey: 'task',
      sourceKind: 'tâche',
      paramsJson: '{"title":"你好"}',
      createdAt: 10,
    }
    await db.insert(kitNotifications).values([
      { ...base, id: 'a', sourceId: 'a', moduleId: null },
      { ...base, id: 'b', sourceId: 'b', moduleId: 'allowed' },
      { ...base, id: 'z', sourceId: 'z', moduleId: 'hidden' },
      { ...base, id: 'other', sourceId: 'c', userId: 'other' },
      { ...base, id: 'foreign', sourceId: 'd', orgId: 'foreign' },
      { ...base, id: 'resolved', sourceId: 'e', resolvedAt: 11 },
    ])
    const first = await listInbox(db, scope, { limit: 1, unreadOnly: true })
    expect(first.items.map((x) => x.id)).toEqual(['b'])
    expect(first.nextCursor).toBeTruthy()
    const second = await listInbox(db, scope, {
      limit: 1,
      unreadOnly: true,
      cursor: first.nextCursor!,
    })
    expect(second.items[0]?.params).toEqual({ title: '你好' })
    expect(second.items[0]?.id).toBe('a')
    expect(await countUnread(db, scope)).toBe(2)
    expect(await markRead(db, scope, { id: 'z', now: 20 })).toBe(0)
    expect(await markRead(db, scope, { id: 'foreign', now: 20 })).toBe(0)
    expect(await markRead(db, scope, { now: 20 })).toBe(3)
    expect(await markRead(db, scope, { now: 30 })).toBe(0)
    expect(
      (await listInbox(db, scope, { unreadOnly: false })).items.find((x) => x.id === 'a')?.readAt,
    ).toBe(20)
    expect(await countUnread(db, scope)).toBe(0)
    const largeScope = {
      ...scope,
      readableModuleIds: Array.from({ length: 200 }, (_, i) => `m${i}`),
    }
    await countUnread(db, largeScope)
    expect(Math.max(...boundParams)).toBeLessThanOrEqual(100)
  })
  it('checks existence using validated inbox visibility and ownership', async () => {
    const { db } = createMemoryD1()
    const base = {
      orgId: 'org',
      userId: 'user',
      typeKey: 'task',
      sourceKind: 'task',
      paramsJson: '{"unexpected":true}',
      createdAt: 10,
    }
    await db.insert(kitNotifications).values([
      { ...base, id: 'plain', sourceId: 'plain', moduleId: null, readAt: 11 },
      { ...base, id: 'allowed', sourceId: 'allowed', moduleId: 'allowed', resolvedAt: 11 },
      { ...base, id: 'hidden', sourceId: 'hidden', moduleId: 'hidden' },
      { ...base, id: 'other', sourceId: 'other', userId: 'other' },
      { ...base, id: 'foreign', sourceId: 'foreign', orgId: 'foreign' },
    ])
    expect(await hasInboxNotification(db, scope, 'plain')).toBe(true)
    expect(await hasInboxNotification(db, scope, 'allowed')).toBe(true)
    expect(await hasInboxNotification(db, scope, 'hidden')).toBe(false)
    expect(await hasInboxNotification(db, scope, 'other')).toBe(false)
    expect(await hasInboxNotification(db, scope, 'foreign')).toBe(false)
    expect(await hasInboxNotification(db, scope, 'missing')).toBe(false)
    expect(await hasInboxNotification(db, { ...scope, readableModuleIds: [] }, 'allowed')).toBe(
      false,
    )
    expect(
      await hasInboxNotification(db, { ...scope, readableModuleIds: ['hidden'] }, 'hidden'),
    ).toBe(true)
    await expect(hasInboxNotification(db, scope, '')).rejects.toThrow()
    await expect(hasInboxNotification(db, { ...scope, orgId: '' }, 'plain')).rejects.toThrow()
  })
  it('validates cursor shape and supports the maximum ASCII key', async () => {
    const { db } = createMemoryD1()
    const id = 'x'.repeat(256)
    await db.insert(kitNotifications).values([
      {
        id,
        orgId: 'org',
        userId: 'user',
        typeKey: 'task',
        sourceKind: 'kind',
        sourceId: '一',
        paramsJson: '{}',
        createdAt: Number.MAX_SAFE_INTEGER,
      },
      {
        id: 'a',
        orgId: 'org',
        userId: 'user',
        typeKey: 'task',
        sourceKind: 'kind',
        sourceId: '二',
        paramsJson: '{}',
        createdAt: Number.MAX_SAFE_INTEGER,
      },
    ])
    const page = await listInbox(db, scope, { unreadOnly: false, limit: 1 })
    expect(page.items[0]?.id).toBe(id)
    expect(page.nextCursor!.length).toBeLessThanOrEqual(512)
    expect(
      (await listInbox(db, scope, { unreadOnly: false, limit: 1, cursor: page.nextCursor! }))
        .items[0]?.id,
    ).toBe('a')
    await expect(
      listInbox(db, scope, {
        unreadOnly: false,
        cursor: encodeListCursor({ createdAt: 1, id: 'é' }),
      }),
    ).rejects.toThrow()
    await expect(
      listInbox(db, scope, {
        unreadOnly: false,
        cursor: encodeListCursor({ createdAt: 1, id: 'ok', extra: 1 }),
      }),
    ).rejects.toThrow()
    await expect(
      listInbox(db, scope, {
        unreadOnly: false,
        cursor: encodeListCursor(JSON.parse('{"createdAt":1,"id":"ok","__proto__":1}')),
      }),
    ).rejects.toThrow()
  })
})
