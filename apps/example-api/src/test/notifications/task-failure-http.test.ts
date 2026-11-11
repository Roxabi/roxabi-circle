import { kitNotifications } from '@kit/notifications/schema'
import { kitTasks } from '@kit/tasks/schema'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createNotificationFixture, type NotificationFixture } from './fixture'

let f: NotificationFixture
beforeEach(async () => {
  f = await createNotificationFixture()
})
afterEach(() => {
  vi.restoreAllMocks()
  f.env.close()
})

it('returns a safe HTTP failure after a real admission error while retaining the committed task', async () => {
  const headers = await f.headersFor('user_staff', 'org_acme')
  await f.db.run(
    sql.raw(
      "CREATE TRIGGER fail_task_notice BEFORE INSERT ON kit_notifications BEGIN SELECT RAISE(ABORT, 'secret-admission-error'); END",
    ),
  )
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const response = await f.app.request(
    '/api/tasks',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: 'private-task-title',
        boardKey: 'main',
        visibility: 'shared',
        assigneeIds: ['user_team_owner'],
      }),
    },
    f.env,
  )
  expect(response.status).toBe(500)
  const body = await response.text()
  expect(body).not.toContain('secret-admission-error')
  expect(body).not.toContain('private-task-title')
  const logs = JSON.stringify(log.mock.calls)
  expect(logs).toContain('task_notification_failed')
  expect(logs).not.toContain('secret-admission-error')
  expect(logs).not.toContain('private-task-title')
  const tasks = await f.db.select().from(kitTasks).where(eq(kitTasks.title, 'private-task-title'))
  expect(tasks).toHaveLength(1)
  expect(
    await f.db.select().from(kitNotifications).where(eq(kitNotifications.sourceId, tasks[0]!.id)),
  ).toEqual([])
})
