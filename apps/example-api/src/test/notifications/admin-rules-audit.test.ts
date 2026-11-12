import { auditEvents } from '@kit/auth/schema'
import { eq, like } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createNotificationFixture } from './fixture'

const input = {
  selector: { kind: 'type', value: 'tasks.assigned' },
  channel: 'email',
  enabled: false,
  locked: false,
}

describe('admin rule audit', () => {
  it.each([
    { path: '/api/platform/notification-rules', user: 'user_super', org: null },
    { path: '/api/orgs/org_acme/notification-rules', user: 'user_staff', org: 'org_acme' },
  ])('atomically audits changes but not no-ops in $path', async ({ path, user, org }) => {
    const f = await createNotificationFixture()
    try {
      const headers = await f.headersFor(user)
      const put = (value: unknown) =>
        f.app.request(path, { method: 'PUT', headers, body: JSON.stringify(value) }, f.env)
      const del = (id: string) =>
        f.app.request(`${path}/${id}`, { method: 'DELETE', headers }, f.env)
      const events = () =>
        f.db.select().from(auditEvents).where(like(auditEvents.action, 'notification.rule.%'))
      const first = await put(input)
      expect(first.status).toBe(200)
      const { rule } = (await first.json()) as { rule: { id: string; updatedAt: number } }
      const same = await put(input)
      expect(same.status).toBe(200)
      const replay = (await same.json()) as { rule: { id: string; updatedAt: number } }
      expect(replay.rule).toMatchObject({ id: rule.id, updatedAt: rule.updatedAt })
      expect(await events()).toHaveLength(1)
      const changed = await put({ ...input, enabled: true })
      expect(changed.status).toBe(200)
      expect(((await changed.json()) as { rule: { id: string } }).rule.id).toBe(rule.id)
      expect(await events()).toHaveLength(2)
      expect((await del('missing')).status).toBe(200)
      expect(await events()).toHaveLength(2)
      expect((await del(rule.id)).status).toBe(200)
      expect((await del(rule.id)).status).toBe(200)
      const rows = await events()
      expect(rows.map((event) => event.action).sort()).toEqual([
        'notification.rule.delete',
        'notification.rule.set',
        'notification.rule.set',
      ])
      for (const event of rows) {
        expect(event).toMatchObject({
          actorUserId: user,
          targetType: 'notification.rule',
          targetId: rule.id,
          orgId: org,
        })
        const metadata = JSON.parse(event.metaJson!) as Record<string, unknown>
        expect(Object.keys(metadata).sort()).toEqual([
          'channel',
          'enabled',
          'locked',
          'selectorKind',
          'selectorValue',
        ])
        expect(metadata).toMatchObject({
          selectorKind: 'type',
          selectorValue: 'tasks.assigned',
          channel: 'email',
        })
        expect(JSON.stringify(event)).not.toMatch(/@kit\.local|params|provider|address/i)
      }
    } finally {
      f.env.close()
    }
  })

  it('does not delete or audit a rule belonging to another organization', async () => {
    const f = await createNotificationFixture()
    try {
      const acme = await f.headersFor('user_staff')
      const solo = await f.headersFor('user_solo')
      const created = await f.app.request(
        '/api/orgs/org_solo/notification-rules',
        {
          method: 'PUT',
          headers: solo,
          body: JSON.stringify(input),
        },
        f.env,
      )
      expect(created.status).toBe(200)
      const { rule } = (await created.json()) as { rule: { id: string } }
      const deleted = await f.app.request(
        `/api/orgs/org_acme/notification-rules/${rule.id}`,
        {
          method: 'DELETE',
          headers: acme,
        },
        f.env,
      )
      expect(deleted.status).toBe(200)
      const list = await f.app.request(
        '/api/orgs/org_solo/notification-rules',
        { headers: solo },
        f.env,
      )
      expect(
        ((await list.json()) as { items: Array<{ id: string }> }).items.map((item) => item.id),
      ).toContain(rule.id)
      expect(
        await f.db
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.action, 'notification.rule.delete')),
      ).toHaveLength(0)
    } finally {
      f.env.close()
    }
  })

  it.each([
    { path: '/api/platform/notification-rules', user: 'user_super' },
    { path: '/api/orgs/org_acme/notification-rules', user: 'user_staff' },
  ])(
    'rolls back inserts, updates and deletes if audit insertion fails in $path',
    async ({ path, user }) => {
      const f = await createNotificationFixture()
      try {
        const headers = await f.headersFor(user)
        const put = (value: unknown) =>
          f.app.request(path, { method: 'PUT', headers, body: JSON.stringify(value) }, f.env)
        const list = async () =>
          (
            (await (await f.app.request(path, { headers }, f.env)).json()) as {
              items: Array<{ id: string; enabled: boolean }>
            }
          ).items
        const created = await put(input)
        expect(created.status).toBe(200)
        const { rule } = (await created.json()) as { rule: { id: string } }
        await f.env.DB.exec(
          "CREATE TRIGGER fail_notification_audit BEFORE INSERT ON audit_events WHEN NEW.action LIKE 'notification.rule.%' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END",
        )
        expect((await put({ ...input, enabled: true })).status).toBe(500)
        expect(
          (await put({ ...input, selector: { kind: 'category', value: 'tasks' } })).status,
        ).toBe(500)
        expect(
          (await f.app.request(`${path}/${rule.id}`, { method: 'DELETE', headers }, f.env)).status,
        ).toBe(500)
        expect(await list()).toEqual([expect.objectContaining({ id: rule.id, enabled: false })])
        expect(
          await f.db
            .select()
            .from(auditEvents)
            .where(eq(auditEvents.action, 'notification.rule.set')),
        ).toHaveLength(1)
        expect(
          await f.db
            .select()
            .from(auditEvents)
            .where(eq(auditEvents.action, 'notification.rule.delete')),
        ).toHaveLength(0)
      } finally {
        f.env.close()
      }
    },
  )
})
