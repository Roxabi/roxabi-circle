import { describe, expect, it, vi } from 'vitest'
import type { GatewayMessage } from '../src/discord/github-watch'
import {
  authorAllowedForLyra,
  extractGuildPrivilege,
  LYRA_DISCORD_USER_ID,
  LYRA_MENTION_SOURCE,
  LYRA_PAYLOAD_KEYS,
  mentionsLyraUser,
  planLyraMentionForward,
  postLyraGrokWebhook,
  scheduleLyraMentionForward,
} from '../src/discord/lyra-mention'

const MEMBER_ROLE = 'role-member'
const GUILD = 'guild-1'
const ADMIN_ROLE = 'role-admin'

function msg(over: Partial<GatewayMessage> = {}): GatewayMessage {
  return {
    id: 'm1',
    channel_id: 'ch1',
    guild_id: GUILD,
    content: `hey <@${LYRA_DISCORD_USER_ID}>`,
    author: { id: 'u1', bot: false, username: 'alice' },
    mentions: [{ id: LYRA_DISCORD_USER_ID }],
    member: { roles: [MEMBER_ROLE] },
    ...over,
  }
}

function plan(over: Partial<GatewayMessage> = {}, extra: { webhookUrl?: string | null } = {}) {
  return planLyraMentionForward({
    msg: msg(over),
    webhookUrl: extra.webhookUrl === undefined ? 'https://grok.example/hook' : extra.webhookUrl,
    memberRoleId: MEMBER_ROLE,
    configuredGuildId: GUILD,
  })
}

function ignoreReason(action: ReturnType<typeof planLyraMentionForward>): string | undefined {
  return action.type === 'ignore' ? action.reason : undefined
}

describe('mentionsLyraUser', () => {
  it('detects mentions array', () => {
    expect(mentionsLyraUser({ mentions: [{ id: LYRA_DISCORD_USER_ID }], content: 'hi' })).toBe(true)
  })

  it('detects <@id> and <@!id> in content', () => {
    expect(mentionsLyraUser({ content: `<@${LYRA_DISCORD_USER_ID}>` })).toBe(true)
    expect(mentionsLyraUser({ content: `<@!${LYRA_DISCORD_USER_ID}> ping` })).toBe(true)
  })

  it('ignores @everyone and other users', () => {
    expect(mentionsLyraUser({ content: '@everyone', mentions: [{ id: 'someone-else' }] })).toBe(
      false,
    )
  })
})

describe('authorAllowedForLyra', () => {
  it('allows member role', () => {
    expect(
      authorAllowedForLyra({
        authorId: 'u1',
        memberRoles: [MEMBER_ROLE],
        memberRoleId: MEMBER_ROLE,
      }),
    ).toBe(true)
  })

  it('allows Administrator bitfield on member.permissions', () => {
    expect(
      authorAllowedForLyra({
        authorId: 'u1',
        memberRoles: [],
        memberPermissions: '8',
        memberRoleId: MEMBER_ROLE,
      }),
    ).toBe(true)
  })

  it('allows guild owner from privilege cache', () => {
    expect(
      authorAllowedForLyra({
        authorId: 'owner-1',
        memberRoles: [],
        memberRoleId: MEMBER_ROLE,
        privilege: { ownerId: 'owner-1', adminRoleIds: [] },
      }),
    ).toBe(true)
  })

  it('allows admin role from privilege cache', () => {
    expect(
      authorAllowedForLyra({
        authorId: 'u2',
        memberRoles: [ADMIN_ROLE],
        memberRoleId: MEMBER_ROLE,
        privilege: { ownerId: 'owner-1', adminRoleIds: [ADMIN_ROLE] },
      }),
    ).toBe(true)
  })

  it('denies visitors without role or privilege', () => {
    expect(
      authorAllowedForLyra({
        authorId: 'u3',
        memberRoles: [],
        memberRoleId: MEMBER_ROLE,
        privilege: { ownerId: 'owner-1', adminRoleIds: [ADMIN_ROLE] },
      }),
    ).toBe(false)
  })
})

describe('extractGuildPrivilege', () => {
  it('picks owner and Administrator roles', () => {
    const p = extractGuildPrivilege({
      owner_id: 'owner-1',
      roles: [
        { id: ADMIN_ROLE, permissions: '8' },
        { id: MEMBER_ROLE, permissions: '0' },
      ],
    })
    expect(p.ownerId).toBe('owner-1')
    expect(p.adminRoleIds).toEqual([ADMIN_ROLE])
  })
})

describe('planLyraMentionForward', () => {
  it('no-ops when webhook is unset or blank', () => {
    const base = { msg: msg(), memberRoleId: MEMBER_ROLE, configuredGuildId: GUILD }
    expect(ignoreReason(planLyraMentionForward({ ...base }))).toBe('no_webhook')
    expect(ignoreReason(planLyraMentionForward({ ...base, webhookUrl: '' }))).toBe('no_webhook')
    expect(ignoreReason(planLyraMentionForward({ ...base, webhookUrl: '   ' }))).toBe('no_webhook')
  })

  it('ignores other guilds, bots, and missing mention', () => {
    expect(ignoreReason(plan({ guild_id: 'other' }))).toBe('other_guild')
    expect(ignoreReason(plan({ author: { id: 'b', bot: true } }))).toBe('bot')
    expect(ignoreReason(plan({ mentions: [], content: 'no ping' }))).toBe('no_mention')
  })

  it('forwards an unmentioned member message in a Lyra-active thread', () => {
    const a = planLyraMentionForward({
      msg: msg({ mentions: [], content: 'follow-up', position: 2 }),
      webhookUrl: 'https://grok.example/hook',
      memberRoleId: MEMBER_ROLE,
      configuredGuildId: GUILD,
      threadActive: true,
    })
    expect(a.type).toBe('forward')
    if (a.type !== 'forward') return
    expect(a.payload.content).toBe('follow-up')
    expect(a.payload.channelId).toBe('ch1')
  })

  it('does not treat threadActive as enough without position', () => {
    expect(
      ignoreReason(
        planLyraMentionForward({
          msg: msg({ mentions: [], content: 'follow-up' }),
          webhookUrl: 'https://grok.example/hook',
          memberRoleId: MEMBER_ROLE,
          configuredGuildId: GUILD,
          threadActive: true,
        }),
      ),
    ).toBe('no_mention')
  })

  it('forwards a member @Lyra with exact payload keys', () => {
    const a = plan()
    expect(a.type).toBe('forward')
    if (a.type !== 'forward') return
    expect(Object.keys(a.payload).sort()).toEqual([...LYRA_PAYLOAD_KEYS].sort())
    expect(a.payload).toEqual({
      source: LYRA_MENTION_SOURCE,
      guildId: GUILD,
      channelId: 'ch1',
      messageId: 'm1',
      authorId: 'u1',
      authorUsername: 'alice',
      content: `hey <@${LYRA_DISCORD_USER_ID}>`,
    })
  })

  it('denies a mention from a non-member without admin bits', () => {
    const a = plan({ member: { roles: [] } })
    expect(a.type).toBe('ignore')
    if (a.type === 'ignore') expect(a.reason).toBe('not_allowed')
  })
})

describe('scheduleLyraMentionForward', () => {
  function memoryStorage(init: Record<string, unknown> = {}) {
    const store = new Map<string, unknown>(Object.entries(init))
    return {
      get: async <T>(key: string) => store.get(key) as T | undefined,
      put: async (key: string, value: unknown) => {
        store.set(key, value)
      },
    }
  }

  it('does not POST when webhook is empty', async () => {
    const fetchImpl = vi.fn()
    const pending: Promise<unknown>[] = []
    scheduleLyraMentionForward(
      {
        webhookUrl: '',
        webhookSecret: 'sender-test',
        memberRoleId: MEMBER_ROLE,
        configuredGuildId: GUILD,
        storage: memoryStorage(),
        waitUntil: (p) => pending.push(p),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      msg(),
    )
    await Promise.all(pending)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not POST a thread follow-up when sender key is empty', async () => {
    const fetchImpl = vi.fn()
    const pending: Promise<unknown>[] = []
    scheduleLyraMentionForward(
      {
        webhookUrl: 'https://grok.example/hook',
        webhookSecret: '',
        memberRoleId: MEMBER_ROLE,
        configuredGuildId: GUILD,
        storage: memoryStorage({ 'lyra_thread_v1:ch1': true }),
        waitUntil: (p) => pending.push(p),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      msg({ mentions: [], content: 'follow-up', position: 2 }),
    )
    await Promise.all(pending)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not POST when sender key is empty', async () => {
    const fetchImpl = vi.fn()
    const pending: Promise<unknown>[] = []
    scheduleLyraMentionForward(
      {
        webhookUrl: 'https://grok.example/hook',
        webhookSecret: '',
        memberRoleId: MEMBER_ROLE,
        configuredGuildId: GUILD,
        storage: memoryStorage(),
        waitUntil: (p) => pending.push(p),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      msg(),
    )
    await Promise.all(pending)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('POSTs JSON via waitUntil without throwing on fetch failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network')
    })
    const pending: Promise<unknown>[] = []
    scheduleLyraMentionForward(
      {
        webhookUrl: 'https://grok.example/hook',
        webhookSecret: 'sender-test',
        memberRoleId: MEMBER_ROLE,
        configuredGuildId: GUILD,
        storage: memoryStorage(),
        waitUntil: (p) => pending.push(p),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      msg(),
    )
    await expect(Promise.all(pending)).resolves.toBeDefined()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(call[0]).toBe('https://grok.example/hook')
    expect(call[1]?.method).toBe('POST')
    const headers = call[1]?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sender-test')
    const body = JSON.parse(String(call[1]?.body)) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual([...LYRA_PAYLOAD_KEYS].sort())
  })

  it('forwards guild owner after privilege cache load', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const pending: Promise<unknown>[] = []
    scheduleLyraMentionForward(
      {
        webhookUrl: 'https://grok.example/hook',
        webhookSecret: 'sender-test',
        memberRoleId: MEMBER_ROLE,
        configuredGuildId: GUILD,
        storage: memoryStorage({
          guild_privilege_v1: { ownerId: 'owner-1', adminRoleIds: [] },
        }),
        waitUntil: (p) => pending.push(p),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      msg({
        author: { id: 'owner-1', bot: false, username: 'boss' },
        member: { roles: [] },
      }),
    )
    await Promise.all(pending)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('marks a Lyra thread post and forwards the next human member message', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const storage = memoryStorage()
    const pending: Promise<unknown>[] = []
    const runtime = {
      webhookUrl: 'https://grok.example/hook',
      webhookSecret: 'sender-test',
      memberRoleId: MEMBER_ROLE,
      configuredGuildId: GUILD,
      storage,
      waitUntil: (p: Promise<unknown>) => pending.push(p),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }
    scheduleLyraMentionForward(
      runtime,
      msg({
        channel_id: 'thread-1',
        id: 'lyra-1',
        author: { id: LYRA_DISCORD_USER_ID, bot: true, username: 'Lyra' },
        mentions: [],
        content: 'here is the answer',
        position: 1,
        member: { roles: [] },
      }),
    )
    await Promise.all(pending)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await storage.get('lyra_thread_v1:thread-1')).toBe(true)

    pending.length = 0
    scheduleLyraMentionForward(
      runtime,
      msg({
        channel_id: 'thread-1',
        id: 'human-2',
        mentions: [],
        content: 'thanks, and the rollback?',
        position: 2,
      }),
    )
    await Promise.all(pending)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(call[0]).toBe('https://grok.example/hook')
    const headers = call[1]?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sender-test')
    const body = JSON.parse(String(call[1]?.body)) as Record<string, unknown>
    expect(body).toMatchObject({
      source: LYRA_MENTION_SOURCE,
      guildId: GUILD,
      channelId: 'thread-1',
      messageId: 'human-2',
      authorId: 'u1',
      content: 'thanks, and the rollback?',
    })
  })

  it('does not forward an unmentioned thread message when Lyra never posted', async () => {
    const fetchImpl = vi.fn()
    const pending: Promise<unknown>[] = []
    scheduleLyraMentionForward(
      {
        webhookUrl: 'https://grok.example/hook',
        webhookSecret: 'sender-test',
        memberRoleId: MEMBER_ROLE,
        configuredGuildId: GUILD,
        storage: memoryStorage(),
        waitUntil: (p) => pending.push(p),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      msg({ mentions: [], content: 'anyone here?', position: 3 }),
    )
    await Promise.all(pending)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not forward another bot in a Lyra-active thread', async () => {
    const fetchImpl = vi.fn()
    const pending: Promise<unknown>[] = []
    scheduleLyraMentionForward(
      {
        webhookUrl: 'https://grok.example/hook',
        webhookSecret: 'sender-test',
        memberRoleId: MEMBER_ROLE,
        configuredGuildId: GUILD,
        storage: memoryStorage({ 'lyra_thread_v1:ch1': true }),
        waitUntil: (p) => pending.push(p),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      msg({
        author: { id: 'other-bot', bot: true, username: 'digest' },
        mentions: [],
        content: 'daily ping',
        position: 4,
      }),
    )
    await Promise.all(pending)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('still forwards a classic @Lyra mention after the thread filter', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const pending: Promise<unknown>[] = []
    scheduleLyraMentionForward(
      {
        webhookUrl: 'https://grok.example/hook',
        webhookSecret: 'sender-test',
        memberRoleId: MEMBER_ROLE,
        configuredGuildId: GUILD,
        storage: memoryStorage(),
        waitUntil: (p) => pending.push(p),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      msg(),
    )
    await Promise.all(pending)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('postLyraGrokWebhook', () => {
  it('does not throw on HTTP error', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 502 }))
    await expect(
      postLyraGrokWebhook(
        'https://grok.example/hook',
        {
          source: LYRA_MENTION_SOURCE,
          guildId: GUILD,
          channelId: 'ch1',
          messageId: 'm1',
          authorId: 'u1',
          authorUsername: 'alice',
          content: 'hi',
        },
        fetchImpl as unknown as typeof fetch,
        'sender-test',
      ),
    ).resolves.toBeUndefined()
  })
})
