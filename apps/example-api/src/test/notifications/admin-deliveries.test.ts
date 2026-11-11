import {
  kitNotificationDeliveries,
  kitNotificationOrganizationDeliveries,
  kitNotifications,
} from '@kit/notifications/schema'
import { describe, expect, it } from 'vitest'
import { createNotificationFixture } from './fixture'

const fields = [
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
].sort()

describe('admin delivery metadata', () => {
  it('scopes, filters and pages the combined metadata without exposing content', async () => {
    const f = await createNotificationFixture()
    try {
      const maxId = `u_${'z'.repeat(254)}`
      const timestamp = Number.MAX_SAFE_INTEGER - 86_400_000
      await f.db.insert(kitNotifications).values([
        {
          id: 'n_acme',
          orgId: 'org_acme',
          userId: 'user_staff',
          typeKey: 'tasks.assigned',
          sourceKind: 'task',
          sourceId: 'private source',
          paramsJson: '{"taskTitle":"secret content"}',
          createdAt: 1,
        },
        {
          id: 'n_solo',
          orgId: 'org_solo',
          userId: 'user_solo',
          typeKey: 'tasks.assigned',
          sourceKind: 'task',
          sourceId: 'foreign',
          paramsJson: '{}',
          createdAt: 1,
        },
      ])
      const common = {
        channel: 'email',
        admissionStatus: 'pending',
        admissionDeadlineAt: timestamp + 86_400_000,
        createdAt: timestamp,
        attemptCount: 1,
      }
      await f.db.insert(kitNotificationDeliveries).values([
        {
          ...common,
          id: maxId,
          orgId: 'org_acme',
          notificationId: 'n_acme',
          workflowId: `nd-v1-${'a'.repeat(64)}`,
          status: 'failed',
          errorCode: 'failed_code',
          finishedAt: timestamp,
        },
        {
          ...common,
          id: 'u_foreign',
          orgId: 'org_solo',
          notificationId: 'n_solo',
          workflowId: `nd-v1-${'b'.repeat(64)}`,
          status: 'failed',
          finishedAt: timestamp,
        },
      ])
      await f.db.insert(kitNotificationOrganizationDeliveries).values({
        ...common,
        id: 'o_acme',
        orgId: 'org_acme',
        destinationId: 'dest_private',
        channel: 'slack',
        typeKey: 'flows.approval_requested',
        sourceKind: 'flow',
        sourceId: 'private source',
        paramsJson: '{"secret":"private content"}',
        workflowId: `nd-v1-${'c'.repeat(64)}`,
        status: 'pending',
      })
      const org = '/api/orgs/org_acme/notification-deliveries'
      const headers = await f.headersFor('user_staff')
      const platformHeaders = await f.headersFor('user_super')
      const get = (path: string, h = headers) => f.app.request(path, { headers: h }, f.env)
      const first = await get(`${org}?limit=1`)
      expect(first.status).toBe(200)
      const page = (await first.json()) as {
        items: Array<Record<string, unknown>>
        nextCursor: string
      }
      expect(page.items[0]?.id).toBe(maxId)
      expect(page.nextCursor.length).toBeLessThanOrEqual(512)
      expect(Object.keys(page.items[0]!).sort()).toEqual(fields)
      const second = await get(`${org}?limit=1&cursor=${page.nextCursor}`)
      expect(second.status).toBe(200)
      const next = (await second.json()) as {
        items: Array<Record<string, unknown>>
        nextCursor: string | null
      }
      expect(next.items.map((item) => item.id)).toEqual(['o_acme'])
      expect(next.nextCursor).toBeNull()
      expect(Object.keys(next.items[0]!).sort()).toEqual(fields)
      expect(JSON.stringify([page, next])).not.toMatch(
        /secret content|private source|private content|org_solo|provider/i,
      )
      const filtered = await get(
        `${org}?status=pending&channel=slack&type=flows.approval_requested&targetKind=organization`,
      )
      expect(filtered.status).toBe(200)
      expect(
        ((await filtered.json()) as { items: Array<{ id: string }> }).items.map((x) => x.id),
      ).toEqual(['o_acme'])
      const none = await get(`${org}?status=failed&channel=slack`)
      expect(((await none.json()) as { items: unknown[] }).items).toEqual([])
      const failures = await get(
        '/api/platform/notification-deliveries?channel=email&type=tasks.assigned&targetKind=user',
        platformHeaders,
      )
      expect(failures.status).toBe(200)
      const global = (await failures.json()) as { items: Array<Record<string, unknown>> }
      expect(global.items.map((item) => item.id)).toEqual([maxId, 'u_foreign'])
      expect(global.items.map((item) => item.orgId)).toEqual(['org_acme', 'org_solo'])
      expect(Object.keys(global.items[0]!).sort()).toEqual([...fields, 'orgId'].sort())
      expect(JSON.stringify(global)).not.toMatch(/secret content|private source|provider/i)
    } finally {
      f.env.close()
    }
  })

  it('continues maximum-size failure cursors across target kinds and preserves scope', async () => {
    const f = await createNotificationFixture()
    try {
      const maxId = `u_${'z'.repeat(254)}`
      const timestamp = Number.MAX_SAFE_INTEGER - 86_400_000
      await f.db.insert(kitNotifications).values([
        {
          id: 'failure_acme',
          orgId: 'org_acme',
          userId: 'user_staff',
          typeKey: 'tasks.assigned',
          sourceKind: 'task',
          sourceId: 'task_acme',
          paramsJson: '{}',
          createdAt: 1,
        },
        {
          id: 'failure_solo',
          orgId: 'org_solo',
          userId: 'user_solo',
          typeKey: 'tasks.assigned',
          sourceKind: 'task',
          sourceId: 'task_solo',
          paramsJson: '{}',
          createdAt: 1,
        },
      ])
      const common = {
        channel: 'email',
        admissionStatus: 'pending',
        admissionDeadlineAt: timestamp + 86_400_000,
        createdAt: timestamp,
        attemptCount: 1,
        status: 'failed',
        finishedAt: timestamp,
      }
      await f.db.insert(kitNotificationDeliveries).values([
        {
          ...common,
          id: maxId,
          orgId: 'org_acme',
          notificationId: 'failure_acme',
          workflowId: `nd-v1-${'d'.repeat(64)}`,
        },
        {
          ...common,
          id: 'u_foreign',
          createdAt: timestamp - 1,
          admissionDeadlineAt: timestamp - 1 + 86_400_000,
          orgId: 'org_solo',
          notificationId: 'failure_solo',
          workflowId: `nd-v1-${'e'.repeat(64)}`,
        },
      ])
      await f.db.insert(kitNotificationOrganizationDeliveries).values({
        ...common,
        id: 'o_organization',
        orgId: 'org_acme',
        destinationId: 'dest_private',
        channel: 'slack',
        typeKey: 'flows.approval_requested',
        sourceKind: 'flow',
        sourceId: 'flow_acme',
        paramsJson: '{}',
        workflowId: `nd-v1-${'f'.repeat(64)}`,
      })
      const platformHeaders = await f.headersFor('user_super')
      const orgHeaders = await f.headersFor('user_staff')
      const platform = '/api/platform/notification-deliveries?limit=1'
      const organization = '/api/orgs/org_acme/notification-deliveries?status=failed&limit=1'
      const getPage = async (path: string, headers: Record<string, string>) => {
        const response = await f.app.request(path, { headers }, f.env)
        expect(response.status).toBe(200)
        return (await response.json()) as {
          items: Array<{ id: string; targetKind: string; orgId?: string }>
          nextCursor: string | null
        }
      }
      const first = await getPage(platform, platformHeaders)
      expect(first.items).toMatchObject([{ id: maxId, targetKind: 'user', orgId: 'org_acme' }])
      expect(first.nextCursor).toBeTruthy()
      expect(first.nextCursor!.length).toBeLessThanOrEqual(512)
      const second = await getPage(`${platform}&cursor=${first.nextCursor}`, platformHeaders)
      expect(second.items).toMatchObject([
        { id: 'o_organization', targetKind: 'organization', orgId: 'org_acme' },
      ])
      expect(second.nextCursor).toBeTruthy()
      const third = await getPage(`${platform}&cursor=${second.nextCursor}`, platformHeaders)
      expect(third.items).toMatchObject([
        { id: 'u_foreign', targetKind: 'user', orgId: 'org_solo' },
      ])
      expect(third.nextCursor).toBeNull()
      const scoped = await getPage(`${organization}&cursor=${first.nextCursor}`, orgHeaders)
      expect(scoped.items).toMatchObject([{ id: 'o_organization', targetKind: 'organization' }])
      expect(scoped.nextCursor).toBeNull()
    } finally {
      f.env.close()
    }
  })
})
