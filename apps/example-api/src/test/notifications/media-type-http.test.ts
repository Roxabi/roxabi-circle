import {
  kitNotificationDeploymentRules,
  kitNotificationOrganizationRules,
  kitNotifications,
  kitNotificationUserRules,
} from '@kit/notifications/schema'
import { describe, expect, it } from 'vitest'
import { auditEvents } from '../../db/schema'
import { createNotificationFixture } from './fixture'

const userRule = {
  selector: { kind: 'type', value: 'tasks.assigned' },
  channel: 'email',
  enabled: false,
}
const adminRule = { ...userRule, locked: false }
const cases = [
  { path: '/api/me/notification-rules', method: 'PUT', user: 'user_staff', body: userRule },
  { path: '/api/platform/notification-rules', method: 'PUT', user: 'user_super', body: adminRule },
  {
    path: '/api/orgs/org_acme/notification-rules',
    method: 'PUT',
    user: 'user_staff',
    body: adminRule,
  },
  {
    path: '/api/orgs/org_acme/notifications/media_read/read',
    method: 'POST',
    user: 'user_staff',
    body: {},
  },
  {
    path: '/api/orgs/org_acme/notifications/read-all',
    method: 'POST',
    user: 'user_staff',
    body: {},
  },
] as const

describe('notification mutation media types', () => {
  it.each(cases.flatMap((entry) => [undefined, 'text/plain'].map((media) => ({ entry, media }))))(
    'rejects $media for $entry.path without writes and preserves auth precedence',
    async ({ entry, media }) => {
      const f = await createNotificationFixture()
      try {
        await f.db.insert(kitNotifications).values({
          id: 'media_read',
          orgId: 'org_acme',
          userId: 'user_staff',
          typeKey: 'tasks.assigned',
          sourceKind: 'task',
          sourceId: 'media_read',
          paramsJson: JSON.stringify({ taskTitle: 'Private title' }),
          moduleId: 'tasks',
          createdAt: 100,
        })
        const snapshot = async () => ({
          user: await f.db.select().from(kitNotificationUserRules),
          deployment: await f.db.select().from(kitNotificationDeploymentRules),
          org: await f.db.select().from(kitNotificationOrganizationRules),
          inbox: await f.db.select().from(kitNotifications),
          audit: await f.db.select().from(auditEvents),
        })
        const bearer = await f.bearerFor('user_staff', 'org_acme')
        const session = await f.headersFor(entry.user, 'org_acme')
        const headers = new Headers(session)
        headers.delete('content-type')
        if (media) headers.set('content-type', media)
        const body = new TextEncoder().encode(JSON.stringify(entry.body))
        const before = await snapshot()
        const response = await f.app.request(
          entry.path,
          { method: entry.method, headers, body },
          f.env,
        )
        expect(response.status).toBe(400)
        const result = (await response.json()) as {
          error: { code: string; message: string }
          requestId: string
        }
        expect(result.error.code).toBe('VALIDATION_ERROR')
        expect(result.requestId).toBeTruthy()
        expect(response.headers.get('x-request-id')).toBe(result.requestId)
        expect(JSON.stringify(result)).not.toContain('Private title')
        expect(JSON.stringify(result)).not.toContain('Unsupported Media Type')
        expect(await snapshot()).toEqual(before)
        const anonymous = await f.app.request(
          entry.path,
          { method: entry.method, headers: media ? { 'content-type': media } : {}, body },
          f.env,
        )
        expect(anonymous.status).toBe(401)
        const keyHeaders = new Headers(bearer)
        keyHeaders.delete('content-type')
        if (media) keyHeaders.set('content-type', media)
        const key = await f.app.request(
          entry.path,
          { method: entry.method, headers: keyHeaders, body },
          f.env,
        )
        expect(key.status).toBe(403)
        expect(await snapshot()).toEqual(before)
        const valid = await f.app.request(
          entry.path,
          {
            method: entry.method,
            headers: session,
            body: JSON.stringify(entry.body),
          },
          f.env,
        )
        expect(valid.status).toBe(200)
      } finally {
        f.env.close()
      }
    },
  )
})
