import { auditEvents } from '@kit/auth/schema'
import { kitNotifications } from '@kit/notifications/schema'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNotificationFixture, type NotificationFixture } from './fixture'

type Page = {
  items: Array<{
    id: string
    content: { title: string; body: string; href: string }
    readAt: number | null
    resolvedAt: number | null
  }>
}
const base = '/api/orgs/org_acme/notifications'
let f: NotificationFixture

async function insert(id: string, overrides: Partial<typeof kitNotifications.$inferInsert> = {}) {
  await f.db.insert(kitNotifications).values({
    id,
    orgId: 'org_acme',
    userId: 'user_staff',
    typeKey: 'tasks.assigned',
    sourceKind: 'task',
    sourceId: id,
    paramsJson: JSON.stringify({ taskTitle: 'Café 東京' }),
    moduleId: 'tasks',
    createdAt: 100,
    ...overrides,
  })
}

async function request(path: string, init: RequestInit = {}) {
  return f.app.request(
    path,
    { ...init, headers: { ...(await f.headersFor('user_staff', 'org_acme')), ...init.headers } },
    f.env,
  )
}
async function page(): Promise<Page> {
  const response = await request(base)
  expect(response.status).toBe(200)
  return response.json() as Promise<Page>
}
async function count() {
  const response = await request(`${base}/unread-count`)
  expect(response.status).toBe(200)
  const body: unknown = await response.json()
  expect(body).toMatchObject({ unreadCount: expect.any(Number) })
  if (
    !body ||
    typeof body !== 'object' ||
    !('unreadCount' in body) ||
    typeof body.unreadCount !== 'number'
  )
    throw new Error('Invalid unread count')
  return body.unreadCount
}
async function read(path: string) {
  return request(path, { method: 'POST', body: '{}' })
}

beforeEach(async () => {
  f = await createNotificationFixture()
})
afterEach(() => {
  f.env.close()
})
describe('notification inbox HTTP isolation and session credentials', () => {
  it('requires a session for every inbox resource, rejecting anonymous and authenticated keys', async () => {
    const key = await f.bearerFor('user_staff', 'org_acme')
    for (const [path, method] of [
      [base, 'GET'],
      [`${base}/unread-count`, 'GET'],
      [`${base}/n1/read`, 'POST'],
      [`${base}/read-all`, 'POST'],
    ] as const) {
      const body = method === 'POST' ? '{}' : undefined
      expect(
        (
          await f.app.request(
            path,
            { method, body, headers: { 'content-type': 'application/json' } },
            f.env,
          )
        ).status,
        path,
      ).toBe(401)
      expect((await f.app.request(path, { method, body, headers: key }, f.env)).status, path).toBe(
        403,
      )
    }
  })

  it('denies foreign organizations, header mismatch and super-admin bypass', async () => {
    for (const suffix of ['', '/unread-count', '/n1/read', '/read-all']) {
      const method = suffix.endsWith('/read') || suffix === '/read-all' ? 'POST' : 'GET'
      const init = { method, body: method === 'POST' ? '{}' : undefined }
      const foreign = `/api/orgs/org_solo/notifications${suffix}`
      expect(
        (
          await f.app.request(
            foreign,
            { ...init, headers: await f.headersFor('user_staff') },
            f.env,
          )
        ).status,
      ).toBe(404)
      expect(
        (
          await f.app.request(
            foreign,
            { ...init, headers: await f.headersFor('user_super') },
            f.env,
          )
        ).status,
      ).toBe(404)
      expect(
        (
          await f.app.request(
            `${base}${suffix}`,
            { ...init, headers: await f.headersFor('user_staff', 'org_beta') },
            f.env,
          )
        ).status,
      ).toBe(403)
    }
  })

  it('scopes list and single reads to the caller, preserving the first read timestamp without audit', async () => {
    await insert('own')
    await insert('other', { userId: 'user_team_owner' })
    await insert('foreign', { orgId: 'org_beta' })
    expect((await page()).items.map((item) => item.id)).toEqual(['own'])
    const auditsBefore = await f.db.select().from(auditEvents)
    for (const id of ['other', 'foreign', 'missing'])
      expect((await read(`${base}/${id}/read`)).status).toBe(404)
    expect((await read(`${base}/own/read`)).status).toBe(200)
    const first = (
      await f.db.select().from(kitNotifications).where(eq(kitNotifications.id, 'own'))
    )[0]!.readAt
    expect(first).not.toBeNull()
    expect((await read(`${base}/own/read`)).status).toBe(200)
    expect(
      (await f.db.select().from(kitNotifications).where(eq(kitNotifications.id, 'own')))[0]!.readAt,
    ).toBe(first)
    expect(await count()).toBe(0)
    expect(await f.db.select().from(auditEvents)).toEqual(auditsBefore)
  })

  it('reads and replays a retained resolved row without changing its resolution, content, count or audit', async () => {
    await insert('resolved', { resolvedAt: 101 })
    const before = (await page()).items
    expect(before).toHaveLength(1)
    expect(before[0]).toMatchObject({
      id: 'resolved',
      content: { title: 'Tâche assignée', body: 'Café 東京', href: '/app/tasks' },
      readAt: null,
      resolvedAt: 101,
    })
    expect(await count()).toBe(0)
    const auditsBefore = await f.db.select().from(auditEvents)

    const firstResponse = await read(`${base}/resolved/read`)
    expect(firstResponse.status).toBe(200)
    expect(await firstResponse.json()).toMatchObject({ ok: true })
    const first = (await page()).items[0]!
    expect(first).toMatchObject({ ...before[0], readAt: expect.any(Number) })
    expect(await count()).toBe(0)

    const clock = vi.spyOn(Date, 'now').mockReturnValue(first.readAt! + 10_000)
    try {
      const replay = await read(`${base}/resolved/read`)
      expect(replay.status).toBe(200)
      expect(await replay.json()).toMatchObject({ ok: true })
    } finally {
      clock.mockRestore()
    }
    expect((await page()).items).toEqual([first])
    expect(await count()).toBe(0)
    expect(await f.db.select().from(auditEvents)).toEqual(auditsBefore)
  })
})
