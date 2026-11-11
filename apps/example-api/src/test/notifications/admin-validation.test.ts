import {
  kitNotificationDeploymentRules,
  kitNotificationOrganizationRules,
} from '@kit/notifications/schema'
import { describe, expect, it } from 'vitest'
import { createNotificationFixture } from './fixture'

const body = {
  selector: { kind: 'type', value: 'tasks.assigned' },
  channel: 'email',
  enabled: false,
  locked: false,
}
const cursor = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

describe('admin notification request validation and cursors', () => {
  it('rejects unknown and repeated query parameters, malformed cursors and unsupported filters', async () => {
    const f = await createNotificationFixture()
    try {
      const headers = await f.headersFor('user_super')
      const lists = [
        '/api/platform/notification-rules',
        '/api/platform/notification-deliveries',
        '/api/orgs/org_solo/notification-rules',
        '/api/orgs/org_solo/notification-deliveries',
      ]
      const bad = [
        'q=secret',
        'limit=1&limit=2',
        'limit=0',
        'limit=101',
        'cursor=bad%25',
        `cursor=${'a'.repeat(513)}`,
        `cursor=${cursor({ createdAt: 1, id: 'valid', extra: 'secret-cursor-value' })}`,
        `cursor=${cursor({ createdAt: -1, id: 'x' })}`,
        `cursor=${cursor({ createdAt: 1, id: 'é' })}`,
        `cursor=${Buffer.from('{"createdAt":1,"id":"x","__proto__":{"polluted":true}}').toString('base64url')}`,
      ]
      for (const path of lists)
        for (const query of bad) {
          const response = await f.app.request(`${path}?${query}`, { headers }, f.env)
          expect(response.status, `${path}?${query}`).toBe(400)
          expect(await response.text()).not.toContain('secret-cursor-value')
        }
      for (const query of [
        'status=pending',
        'targetKind=user&targetKind=organization',
        'channel=email&channel=slack',
      ]) {
        expect(
          (
            await f.app.request(
              `/api/platform/notification-deliveries?${query}`,
              { headers },
              f.env,
            )
          ).status,
        ).toBe(400)
      }
      expect(
        (
          await f.app.request(
            '/api/orgs/org_solo/notification-deliveries?status=bogus',
            { headers },
            f.env,
          )
        ).status,
      ).toBe(400)
      expect(
        (
          await f.app.request(
            '/api/platform/notification-rules/missing?extra=1',
            { method: 'DELETE', headers },
            f.env,
          )
        ).status,
      ).toBe(400)
    } finally {
      f.env.close()
    }
  })

  it('rejects unknown body fields, raw prototype keys and unsupported selectors or channels', async () => {
    const f = await createNotificationFixture()
    try {
      const headers = await f.headersFor('user_super')
      const inputs = [
        JSON.stringify({ ...body, extra: true }),
        JSON.stringify({ ...body, selector: { ...body.selector, extra: true } }),
        '{"selector":{"kind":"type","value":"tasks.assigned"},"channel":"email","enabled":false,"locked":false,"__proto__":{"polluted":true}}',
        JSON.stringify({ ...body, selector: { kind: 'type', value: 'missing.type' } }),
        JSON.stringify({ ...body, channel: 'unknown' }),
        JSON.stringify({ ...body, channel: 'in_app' }),
        JSON.stringify({ ...body, enabled: true, locked: true }),
      ]
      for (const [path, requestHeaders] of [
        ['/api/platform/notification-rules', headers],
        ['/api/orgs/org_solo/notification-rules', await f.headersFor('user_solo')],
      ] as const) {
        for (const input of inputs) {
          const response = await f.app.request(
            path,
            { method: 'PUT', headers: requestHeaders, body: input },
            f.env,
          )
          expect(response.status, `${path} ${input}`).toBe(400)
        }
      }
    } finally {
      f.env.close()
    }
  })

  it('round-trips a maximum-size deployment rule cursor over HTTP', async () => {
    const f = await createNotificationFixture()
    try {
      const maxId = 'z'.repeat(256)
      const common = {
        selectorKind: 'type',
        channel: 'email',
        enabled: false,
        locked: false,
        createdAt: Number.MAX_SAFE_INTEGER,
        updatedAt: 1,
      }
      await f.db.insert(kitNotificationDeploymentRules).values([
        { ...common, id: maxId, selectorValue: 'tasks.assigned' },
        { ...common, id: 'a', selectorValue: 'flows.approval_requested' },
      ])
      const headers = await f.headersFor('user_super')
      const path = '/api/platform/notification-rules?limit=1'
      const response = await f.app.request(path, { headers }, f.env)
      expect(response.status).toBe(200)
      const first = (await response.json()) as { items: Array<{ id: string }>; nextCursor: string }
      expect(first.items.map((item) => item.id)).toEqual([maxId])
      expect(first.nextCursor.length).toBeLessThanOrEqual(512)
      const next = await f.app.request(`${path}&cursor=${first.nextCursor}`, { headers }, f.env)
      expect(next.status).toBe(200)
      const second = (await next.json()) as {
        items: Array<{ id: string }>
        nextCursor: string | null
      }
      expect(second.items.map((item) => item.id)).toEqual(['a'])
      expect(second.nextCursor).toBeNull()
    } finally {
      f.env.close()
    }
  })

  it('round-trips maximum-size rule cursors without crossing organization scope', async () => {
    const f = await createNotificationFixture()
    try {
      const maxId = 'z'.repeat(256)
      const common = {
        selectorKind: 'type',
        channel: 'email',
        enabled: false,
        locked: false,
        createdAt: Number.MAX_SAFE_INTEGER,
        updatedAt: 1,
      }
      await f.db.insert(kitNotificationOrganizationRules).values([
        { ...common, id: maxId, orgId: 'org_acme', selectorValue: 'tasks.assigned' },
        { ...common, id: 'a', orgId: 'org_acme', selectorValue: 'flows.approval_requested' },
        { ...common, id: 'foreign', orgId: 'org_solo', selectorValue: 'tasks.assigned' },
      ])
      const headers = await f.headersFor('user_staff')
      const path = '/api/orgs/org_acme/notification-rules?limit=1'
      const response = await f.app.request(path, { headers }, f.env)
      expect(response.status).toBe(200)
      const first = (await response.json()) as { items: Array<{ id: string }>; nextCursor: string }
      expect(first.items.map((x) => x.id)).toEqual([maxId])
      expect(first.nextCursor.length).toBeLessThanOrEqual(512)
      const next = await f.app.request(`${path}&cursor=${first.nextCursor}`, { headers }, f.env)
      expect(next.status).toBe(200)
      const second = (await next.json()) as {
        items: Array<{ id: string }>
        nextCursor: string | null
      }
      expect(second.items.map((x) => x.id)).toEqual(['a'])
      expect(second.nextCursor).toBeNull()
    } finally {
      f.env.close()
    }
  })
})
