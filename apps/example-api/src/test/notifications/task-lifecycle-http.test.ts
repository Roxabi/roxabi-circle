import { baMember } from '@kit/auth/schema'
import { kitNotificationDeliveries, kitNotifications } from '@kit/notifications/schema'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createNotificationFixture, type NotificationFixture } from './fixture'

let f: NotificationFixture
const org = 'org_acme'
const recipient = 'user_team_owner'

beforeEach(async () => {
  f = await createNotificationFixture()
})
afterEach(() => {
  f.env.close()
})

async function request(path: string, method: string, body?: object) {
  return f.app.request(
    path,
    {
      method,
      headers: await f.headersFor('user_staff', org),
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    f.env,
  )
}
async function create(assigneeIds = [recipient], visibility = 'shared') {
  const response = await request('/api/tasks', 'POST', {
    title: 'Lifecycle',
    boardKey: 'main',
    visibility,
    assigneeIds,
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as { task: { id: string; stageId: string } }).task
}
async function patch(id: string, body: object) {
  const response = await request(`/api/tasks/${id}`, 'PATCH', body)
  expect(response.status).toBe(200)
}
async function notices(id: string) {
  return f.db.select().from(kitNotifications).where(eq(kitNotifications.sourceId, id))
}

describe('task notification lifecycle', () => {
  it('excludes the assigning actor, deduplicates and resolves on unassignment, completion and deletion', async () => {
    const task = await create([recipient, recipient, 'user_staff'])
    let rows = await notices(task.id)
    expect(rows.map((row) => row.userId)).toEqual([recipient])
    const deliveries = await f.db
      .select()
      .from(kitNotificationDeliveries)
      .where(eq(kitNotificationDeliveries.notificationId, rows[0]!.id))
    await patch(task.id, { assigneeIds: [recipient, 'user_staff'] })
    expect(await notices(task.id)).toHaveLength(1)
    expect(
      await f.db
        .select()
        .from(kitNotificationDeliveries)
        .where(eq(kitNotificationDeliveries.notificationId, rows[0]!.id)),
    ).toEqual(deliveries)
    await patch(task.id, { assigneeIds: ['user_staff'] })
    rows = await notices(task.id)
    expect(rows[0]!.resolvedAt).not.toBeNull()
    await patch(task.id, { assigneeIds: [recipient] })
    rows = await notices(task.id)
    expect(rows).toHaveLength(2)
    expect(rows.filter((row) => row.resolvedAt === null)).toHaveLength(1)
    await patch(task.id, { done: true })
    expect((await notices(task.id)).every((row) => row.resolvedAt !== null)).toBe(true)
    await patch(task.id, { done: false })
    expect(await notices(task.id)).toHaveLength(2)
    await patch(task.id, { assigneeIds: [] })
    await patch(task.id, { assigneeIds: [recipient] })
    expect((await notices(task.id)).filter((row) => row.resolvedAt === null)).toHaveLength(1)
    expect((await request(`/api/tasks/${task.id}`, 'DELETE')).status).toBe(200)
    expect((await notices(task.id)).every((row) => row.resolvedAt !== null)).toBe(true)
  })

  it('resolves a terminal stage even when done is explicitly false', async () => {
    const task = await create()
    const response = await request('/api/tasks/stages?boardKey=main', 'GET')
    expect(response.status).toBe(200)
    const { stages } = (await response.json()) as { stages: { id: string; isTerminal: boolean }[] }
    const terminal = stages.find((stage) => stage.isTerminal)!
    await patch(task.id, { stageId: terminal.id, done: false })
    expect((await notices(task.id))[0]!.resolvedAt).not.toBeNull()
    await patch(task.id, { stageId: task.stageId, done: false })
    expect(await notices(task.id)).toHaveLength(1)
  })

  it('does not notify an assigned reader of an internal task and rejects foreign assignees', async () => {
    await f.db.insert(baMember).values({
      id: 'task_reader_member',
      organizationId: org,
      userId: 'user_team_reader',
      role: 'reader',
      createdAt: new Date(),
    })
    const internal = await create(['user_team_reader'], 'internal')
    expect(await notices(internal.id)).toEqual([])
    const response = await request('/api/tasks', 'POST', {
      title: 'Foreign',
      boardKey: 'main',
      visibility: 'shared',
      assigneeIds: ['user_solo'],
    })
    expect(response.status).toBe(400)
  })
})
