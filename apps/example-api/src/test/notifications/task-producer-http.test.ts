import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createNotificationFixture, type NotificationFixture } from './fixture'

let f: NotificationFixture

beforeEach(async () => {
  f = await createNotificationFixture()
})
afterEach(() => {
  f.env.close()
})

describe('task assignment notifications over HTTP', () => {
  it('creates an inbox notification for the assigned recipient', async () => {
    const response = await f.app.request(
      '/api/tasks',
      {
        method: 'POST',
        headers: await f.headersFor('user_staff', 'org_acme'),
        body: JSON.stringify({
          title: 'Assigned through HTTP',
          boardKey: 'main',
          visibility: 'shared',
          assigneeIds: ['user_team_owner'],
        }),
      },
      f.env,
    )
    expect(response.status).toBe(201)
    const { task } = (await response.json()) as { task: { id: string } }
    const inbox = await f.app.request(
      '/api/orgs/org_acme/notifications',
      {
        headers: await f.headersFor('user_team_owner', 'org_acme'),
      },
      f.env,
    )
    expect(inbox.status).toBe(200)
    const page = (await inbox.json()) as {
      items: { type: string; source: { kind: string; id: string } }[]
    }
    expect(page.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tasks.assigned', source: { kind: 'task', id: task.id } }),
      ]),
    )
  })

  it('uses the represented user as the notification actor for a delegated assignment', async () => {
    const admin = await f.headersFor('user_super', 'org_acme')
    const actor = await f.headersFor('user_staff', 'org_acme')
    const subject = await f.headersFor('user_team_owner', 'org_acme')
    const grant = await f.app.request(
      '/api/admin/impersonation/permissions',
      {
        method: 'PATCH',
        headers: { ...admin, 'X-Impersonation-Id': 'none' },
        body: JSON.stringify({ role: 'staff', read: true, write: true }),
      },
      f.env,
    )
    expect(grant.status).toBe(200)
    const started = await f.app.request(
      '/api/impersonation/start',
      {
        method: 'POST',
        headers: { ...actor, 'X-Impersonation-Id': 'none' },
        body: JSON.stringify({
          organizationId: 'org_acme',
          subjectUserId: 'user_team_owner',
          mode: 'write',
        }),
      },
      f.env,
    )
    expect(started.status).toBe(200)
    const { impersonation } = (await started.json()) as { impersonation: { id: string } }
    const created = await f.app.request(
      '/api/tasks',
      {
        method: 'POST',
        headers: { ...actor, 'X-Impersonation-Id': impersonation.id },
        body: JSON.stringify({
          title: 'Delegated assignment',
          boardKey: 'main',
          visibility: 'shared',
          assigneeIds: ['user_staff', 'user_team_owner'],
        }),
      },
      f.env,
    )
    expect(created.status).toBe(201)
    const { task } = (await created.json()) as { task: { id: string } }
    const stopped = await f.app.request(
      '/api/impersonation/stop',
      {
        method: 'POST',
        headers: { ...actor, 'X-Impersonation-Id': impersonation.id },
        body: JSON.stringify({ impersonationId: impersonation.id }),
      },
      f.env,
    )
    expect(stopped.status).toBe(200)

    const inbox = async (headers: Record<string, string>) => {
      const response = await f.app.request('/api/orgs/org_acme/notifications', { headers }, f.env)
      expect(response.status).toBe(200)
      const page = (await response.json()) as {
        items: { type: string; source: { kind: string; id: string } }[]
      }
      return page.items.filter(
        (item) => item.type === 'tasks.assigned' && item.source.id === task.id,
      )
    }
    expect(await inbox(actor)).toHaveLength(1)
    expect(await inbox(subject)).toHaveLength(0)
  })
})
