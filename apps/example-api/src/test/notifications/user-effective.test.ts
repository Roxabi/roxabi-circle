import { organizationModules, platformModules } from '@kit/auth/schema'
import { encodeListCursor } from '@kit/core'
import {
  kitNotificationDeploymentRules as deployment,
  kitNotificationOrganizationRules as organization,
  kitNotificationUserRules as userRules,
} from '@kit/notifications/schema'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createNotificationFixture } from './fixture'

const endpoint = '/api/orgs/org_team/notifications/effective-rules'

describe('effective notification rule preview', () => {
  it('reads every scoped page, resolves specificity and locks, and keeps availability independent', async () => {
    const f = await createNotificationFixture()
    try {
      const headers = await f.headersFor('user_team_owner', 'org_team')
      const base = {
        selectorKind: 'category',
        channel: 'slack',
        enabled: false,
        locked: false,
        createdAt: 100,
        updatedAt: 100,
      }
      for (let i = 0; i < 101; i++) {
        const row = { ...base, id: `filler_${i}`, selectorValue: `other${i}` }
        await f.db.insert(deployment).values(row)
        await f.db.insert(organization).values({ ...row, orgId: 'org_team' })
        await f.db.insert(userRules).values({ ...row, userId: 'user_team_owner' })
      }
      const oldest = {
        ...base,
        createdAt: 1,
        updatedAt: 1,
        selectorKind: 'type',
        selectorValue: 'tasks.assigned',
      }
      await f.db
        .insert(deployment)
        .values({ ...oldest, id: 'dep_winner', locked: true, enabled: true })
      await f.db
        .insert(organization)
        .values({ ...oldest, id: 'org_winner', orgId: 'org_team', locked: true, enabled: false })
      await f.db
        .insert(userRules)
        .values({ ...oldest, id: 'user_winner', userId: 'user_team_owner', enabled: false })
      await f.db.insert(userRules).values({
        ...base,
        id: 'user_category',
        selectorValue: 'tasks',
        userId: 'user_team_owner',
        enabled: true,
      })
      await f.db
        .update(platformModules)
        .set({ available: true })
        .where(eq(platformModules.moduleId, 'tasks'))
      await f.db
        .update(organizationModules)
        .set({ enabled: true })
        .where(
          and(
            eq(organizationModules.organizationId, 'org_team'),
            eq(organizationModules.moduleId, 'tasks'),
          ),
        )
      async function taskDecision() {
        const response = await f.app.request(endpoint, { headers }, f.env)
        expect(response.status).toBe(200)
        const page = (await response.json()) as {
          items: Array<{
            type: string
            channel: string
            enabled: boolean
            locked: boolean
            available: boolean
            source: { level: string }
          }>
        }
        return page.items.find(
          (item) => item.type === 'tasks.assigned' && item.channel === 'slack',
        )!
      }
      expect(await taskDecision()).toMatchObject({
        enabled: true,
        locked: true,
        available: true,
        source: { level: 'deployment' },
      })
      await f.db
        .update(platformModules)
        .set({ available: false })
        .where(eq(platformModules.moduleId, 'tasks'))
      expect(await taskDecision()).toMatchObject({
        enabled: true,
        locked: true,
        available: false,
        source: { level: 'deployment' },
      })
      await f.db.delete(deployment).where(eq(deployment.id, 'dep_winner'))
      expect(await taskDecision()).toMatchObject({
        enabled: false,
        locked: true,
        available: false,
        source: { level: 'organization' },
      })
      await f.db.delete(organization).where(eq(organization.id, 'org_winner'))
      expect(await taskDecision()).toMatchObject({
        enabled: false,
        locked: false,
        available: false,
        source: { level: 'user' },
      })
      await f.db.delete(userRules).where(eq(userRules.id, 'user_winner'))
      expect(await taskDecision()).toMatchObject({
        enabled: true,
        locked: false,
        available: false,
        source: { level: 'user', selector: { kind: 'category', value: 'tasks' } },
      })
      await f.db.delete(userRules).where(eq(userRules.id, 'user_category'))
      expect(await taskDecision()).toMatchObject({
        enabled: true,
        locked: false,
        available: false,
        source: { level: 'type-default' },
      })
    } finally {
      f.env.close()
    }
  })

  it('roundtrips effective cursors in lexical type/channel order', async () => {
    const f = await createNotificationFixture()
    try {
      const headers = await f.headersFor('user_team_owner', 'org_team')
      const names: string[] = []
      let cursor: string | null = null
      do {
        const response = await f.app.request(
          `${endpoint}?limit=1${cursor ? `&cursor=${cursor}` : ''}`,
          { headers },
          f.env,
        )
        expect(response.status).toBe(200)
        const page = (await response.json()) as {
          items: Array<{ type: string; channel: string }>
          nextCursor: string | null
        }
        names.push(...page.items.map((item) => `${item.type}/${item.channel}`))
        // The 128/64-character grammar maxima cannot be produced by this fixed
        // App registry: its longest type is flows.approval_requested and its
        // longest actual channels are email and slack (five characters each).
        if (names.length === 1) {
          expect(page.nextCursor).toBe(
            encodeListCursor({ type: 'flows.approval_requested', channel: 'email' }),
          )
        }
        if (names.length === 2) {
          expect(page.nextCursor).toBe(
            encodeListCursor({ type: 'flows.approval_requested', channel: 'slack' }),
          )
        }
        cursor = page.nextCursor
      } while (cursor)
      expect(names).toEqual([
        'flows.approval_requested/email',
        'flows.approval_requested/slack',
        'tasks.assigned/email',
        'tasks.assigned/slack',
      ])
    } finally {
      f.env.close()
    }
  })
})
