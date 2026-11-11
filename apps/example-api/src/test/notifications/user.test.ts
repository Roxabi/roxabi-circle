import { auditEvents } from '@kit/auth/schema'
import { encodeListCursor } from '@kit/core'
import { describe, expect, it } from 'vitest'
import { createNotificationFixture } from './fixture'

const types = '/api/notification-types'
const rules = '/api/me/notification-rules'
const effective = '/api/orgs/org_team/notifications/effective-rules'
const input = {
  selector: { kind: 'type', value: 'tasks.assigned' },
  channel: 'email',
  enabled: false,
}

describe('notification user HTTP routes', () => {
  it('requires a session on every resource and conceals foreign organizations', async () => {
    const f = await createNotificationFixture()
    try {
      const key = await f.bearerFor('user_team_owner', 'org_team')
      for (const [path, method] of [
        [types, 'GET'],
        [rules, 'GET'],
        [rules, 'PUT'],
        [`${rules}/missing`, 'DELETE'],
        [effective, 'GET'],
      ] as const) {
        const body = method === 'PUT' ? JSON.stringify(input) : undefined
        expect((await f.app.request(path, { method, body }, f.env)).status).toBe(401)
        expect((await f.app.request(path, { method, headers: key, body }, f.env)).status).toBe(403)
      }
      const headers = await f.headersFor('user_team_owner')
      expect(
        (
          await f.app.request(
            '/api/orgs/org_solo/notifications/effective-rules',
            { headers },
            f.env,
          )
        ).status,
      ).toBe(404)
      const superHeaders = await f.headersFor('user_super')
      expect((await f.app.request(effective, { headers: superHeaders }, f.env)).status).toBe(404)
    } finally {
      f.env.close()
    }
  })

  it('keeps personal rules global, owner-scoped, idempotent and unaudited', async () => {
    const f = await createNotificationFixture()
    try {
      const owner = await f.headersFor('user_team_owner', 'org_team')
      const other = await f.headersFor('user_team_reader', 'org_team')
      const before = await f.db.select().from(auditEvents)
      const set = await f.app.request(
        rules,
        { method: 'PUT', headers: owner, body: JSON.stringify(input) },
        f.env,
      )
      expect(set.status).toBe(200)
      const first = (await set.json()) as { rule: { id: string; locked: boolean } }
      expect(first.rule.locked).toBe(false)
      const again = await f.app.request(
        rules,
        { method: 'PUT', headers: owner, body: JSON.stringify(input) },
        f.env,
      )
      expect(((await again.json()) as typeof first).rule.id).toBe(first.rule.id)
      expect(
        (
          await f.app.request(
            `${rules}/${first.rule.id}`,
            { method: 'DELETE', headers: other },
            f.env,
          )
        ).status,
      ).toBe(200)
      const inOtherOrg = await f.headersFor('user_team_owner', 'org_acme')
      const page = await f.app.request(rules, { headers: inOtherOrg }, f.env)
      expect(((await page.json()) as { items: { id: string }[] }).items.map((r) => r.id)).toContain(
        first.rule.id,
      )
      for (let i = 0; i < 2; i++)
        expect(
          (
            await f.app.request(
              `${rules}/${first.rule.id}`,
              { method: 'DELETE', headers: owner },
              f.env,
            )
          ).status,
        ).toBe(200)
      expect(await f.db.select().from(auditEvents)).toEqual(before)
    } finally {
      f.env.close()
    }
  })

  it('enforces strict queries, cursor own keys and request bodies', async () => {
    const f = await createNotificationFixture()
    try {
      const headers = await f.headersFor('user_team_owner', 'org_team')
      for (const path of [types, rules, effective]) {
        for (const query of ['?q=x', '?limit=1&limit=2', '?__proto__=x', '?cursor=!']) {
          expect((await f.app.request(path + query, { headers }, f.env)).status).toBe(400)
        }
      }
      const rawCursor = btoa('{"type":"tasks.assigned","__proto__":"x"}').replaceAll('=', '')
      expect(
        (
          await f.app.request(
            `${types}?cursor=${encodeURIComponent(rawCursor)}`,
            { headers },
            f.env,
          )
        ).status,
      ).toBe(400)
      const rawRuleCursor = btoa('{"createdAt":1,"id":"x","__proto__":"x"}').replaceAll('=', '')
      expect(
        (
          await f.app.request(
            `${rules}?cursor=${encodeURIComponent(rawRuleCursor)}`,
            { headers },
            f.env,
          )
        ).status,
      ).toBe(400)
      const rawEffectiveCursor = btoa(
        '{"type":"tasks.assigned","channel":"email","__proto__":"x"}',
      ).replaceAll('=', '')
      expect(
        (
          await f.app.request(
            `${effective}?cursor=${encodeURIComponent(rawEffectiveCursor)}`,
            { headers },
            f.env,
          )
        ).status,
      ).toBe(400)
      const invalidBodies = [
        '{"selector":{"kind":"all"},"channel":"email","enabled":true,"locked":false}',
        '{"selector":{"kind":"all"},"channel":"email","enabled":true,"__proto__":1}',
        '{"selector":{"kind":"all","__proto__":1},"channel":"email","enabled":true}',
        JSON.stringify({ ...input, channel: 'missing' }),
        JSON.stringify({ ...input, selector: { kind: 'type', value: 'missing' } }),
      ]
      for (const body of invalidBodies)
        expect((await f.app.request(rules, { method: 'PUT', headers, body }, f.env)).status).toBe(
          400,
        )
      expect(
        (await f.app.request(`${rules}/missing?x=1`, { method: 'DELETE', headers }, f.env)).status,
      ).toBe(400)
    } finally {
      f.env.close()
    }
  })

  it('paginates lexical metadata without exposing rendering or parameters', async () => {
    const f = await createNotificationFixture()
    try {
      const headers = await f.headersFor('user_team_owner', 'org_team')
      const first = await f.app.request(`${types}?limit=1`, { headers }, f.env)
      const p1 = (await first.json()) as { items: Record<string, unknown>[]; nextCursor: string }
      expect(p1.items[0]?.type).toBe('flows.approval_requested')
      expect(Object.keys(p1.items[0]!).sort()).toEqual([
        'category',
        'channels',
        'defaultOn',
        'moduleId',
        'organizationDestinations',
        'type',
      ])
      // The fixed App catalogue cannot produce the 128-character grammar maximum:
      // its longest actual key is flows.approval_requested, which sorts first.
      expect(p1.nextCursor).toBe(encodeListCursor({ type: 'flows.approval_requested' }))
      const second = await f.app.request(
        `${types}?limit=1&cursor=${p1.nextCursor}`,
        { headers },
        f.env,
      )
      expect(second.status).toBe(200)
      const p2 = (await second.json()) as {
        items: Record<string, unknown>[]
        nextCursor: string | null
      }
      expect(p2.items.map((item) => item.type)).toEqual(['tasks.assigned'])
      expect(p2.nextCursor).toBeNull()
    } finally {
      f.env.close()
    }
  })
})
