import { encodeListCursor } from '@kit/core'
import { kitNotificationUserRules } from '@kit/notifications/schema'
import { expect, it } from 'vitest'
import { createNotificationFixture } from './fixture'

it('roundtrips a maximum produced personal rule cursor without crossing owners', async () => {
  const f = await createNotificationFixture()
  try {
    const headers = await f.headersFor('user_team_owner', 'org_team')
    const createdAt = Number.MAX_SAFE_INTEGER
    const id = 'z'.repeat(256)
    const common = {
      createdAt,
      updatedAt: createdAt,
      locked: false,
      enabled: false,
      selectorKind: 'type',
    }
    await f.db.insert(kitNotificationUserRules).values([
      {
        ...common,
        id,
        userId: 'user_team_owner',
        selectorValue: 'tasks.assigned',
        channel: 'email',
      },
      {
        ...common,
        id: 'a',
        userId: 'user_team_owner',
        selectorValue: 'flows.approval_requested',
        channel: 'slack',
      },
      {
        ...common,
        id: 'y',
        userId: 'user_team_reader',
        selectorValue: 'tasks.assigned',
        channel: 'email',
      },
    ])
    const first = await f.app.request('/api/me/notification-rules?limit=1', { headers }, f.env)
    expect(first.status).toBe(200)
    const page = (await first.json()) as { items: Array<{ id: string }>; nextCursor: string }
    expect(page.items.map((row) => row.id)).toEqual([id])
    expect(page.nextCursor).toBe(encodeListCursor({ createdAt, id }))
    expect(page.nextCursor.length).toBe(392)
    const second = await f.app.request(
      `/api/me/notification-rules?limit=1&cursor=${page.nextCursor}`,
      { headers },
      f.env,
    )
    expect(second.status).toBe(200)
    const continuation = (await second.json()) as {
      items: Array<{ id: string }>
      nextCursor: string | null
    }
    expect(continuation.items.map((row) => row.id)).toEqual(['a'])
    expect(continuation.nextCursor).toBeNull()
  } finally {
    f.env.close()
  }
})
