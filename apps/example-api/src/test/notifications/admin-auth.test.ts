import { describe, expect, it } from 'vitest'
import { createNotificationFixture } from './fixture'

const rule = {
  selector: { kind: 'type', value: 'tasks.assigned' },
  channel: 'email',
  enabled: false,
  locked: false,
}
const routes = [
  ['GET', '/api/platform/notification-rules'],
  ['PUT', '/api/platform/notification-rules'],
  ['DELETE', '/api/platform/notification-rules/missing'],
  ['GET', '/api/platform/notification-deliveries'],
  ['GET', '/api/orgs/org_acme/notification-rules'],
  ['PUT', '/api/orgs/org_acme/notification-rules'],
  ['DELETE', '/api/orgs/org_acme/notification-rules/missing'],
  ['GET', '/api/orgs/org_acme/notification-deliveries'],
] as const

describe('notification administration authorization', () => {
  it('requires a session, including for an authenticated API key, on every endpoint', async () => {
    const f = await createNotificationFixture()
    try {
      const bearer = await f.bearerFor('user_staff', 'org_acme')
      for (const [method, path] of routes) {
        const body = method === 'PUT' ? JSON.stringify(rule) : undefined
        const anonymous = await f.app.request(
          path,
          { method, body, headers: { 'content-type': 'application/json' } },
          f.env,
        )
        expect(anonymous.status, `${method} ${path} anonymous`).toBe(401)
        const key = await f.app.request(path, { method, body, headers: bearer }, f.env)
        expect(key.status, `${method} ${path} API key`).toBe(403)
      }
    } finally {
      f.env.close()
    }
  })

  it('enforces platform roles, organization roles, foreign membership and header consistency', async () => {
    const f = await createNotificationFixture()
    try {
      const staff = await f.headersFor('user_staff')
      const superAdmin = await f.headersFor('user_super')
      const member = await f.headersFor('user_team_owner')
      const reader = await f.headersFor('user_team_reader')
      const call = (path: string, headers: Record<string, string>, method = 'GET') =>
        f.app.request(
          path,
          { method, headers, ...(method === 'PUT' ? { body: JSON.stringify(rule) } : {}) },
          f.env,
        )
      expect((await call('/api/platform/notification-rules', staff)).status).toBe(200)
      expect((await call('/api/platform/notification-rules', staff, 'PUT')).status).toBe(403)
      expect((await call('/api/platform/notification-rules/missing', staff, 'DELETE')).status).toBe(
        403,
      )
      expect((await call('/api/platform/notification-deliveries', staff)).status).toBe(403)
      expect((await call('/api/platform/notification-deliveries', superAdmin)).status).toBe(200)
      for (const suffix of ['notification-rules', 'notification-deliveries']) {
        expect((await call(`/api/orgs/org_acme/${suffix}`, staff)).status).toBe(200)
        expect((await call(`/api/orgs/org_acme/${suffix}`, member)).status).toBe(403)
        expect((await call(`/api/orgs/org_team/${suffix}`, reader)).status).toBe(403)
        expect((await call(`/api/orgs/org_solo/${suffix}`, staff)).status).toBe(404)
        expect(
          (await call(`/api/orgs/org_acme/${suffix}`, await f.headersFor('user_staff', 'org_beta')))
            .status,
        ).toBe(403)
      }
      expect((await call('/api/orgs/org_acme/notification-rules', member, 'PUT')).status).toBe(403)
      expect(
        (await call('/api/orgs/org_acme/notification-rules/missing', member, 'DELETE')).status,
      ).toBe(403)
      expect((await call('/api/orgs/org_team/notification-rules', reader, 'PUT')).status).toBe(403)
      expect(
        (await call('/api/orgs/org_team/notification-rules/missing', reader, 'DELETE')).status,
      ).toBe(403)
      expect((await call('/api/orgs/org_solo/notification-rules', superAdmin)).status).toBe(200)
      expect((await call('/api/orgs/org_solo/notification-deliveries', superAdmin)).status).toBe(
        200,
      )
      expect((await call('/api/orgs/org_solo/notification-rules', superAdmin, 'PUT')).status).toBe(
        404,
      )
      expect(
        (await call('/api/orgs/org_solo/notification-rules/missing', superAdmin, 'DELETE')).status,
      ).toBe(404)
      expect((await call('/api/orgs/org_solo/notifications', superAdmin)).status).toBe(404)
    } finally {
      f.env.close()
    }
  })
})
