import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GatewayMessage } from '../src/discord/github-watch'
import {
  LYRA_DISCORD_USER_ID,
  LYRA_PAYLOAD_KEYS,
  scheduleLyraMentionForward,
} from '../src/discord/lyra-mention'
import {
  LYRA_THREAD_KIND_KEY,
  LYRA_THREAD_NAME_MAX,
  lyraThreadTitle,
  resolveLyraReplyThread,
} from '../src/discord/lyra-thread'

const MEMBER_ROLE = 'role-member'
const GUILD = 'guild-1'

function msg(over: Partial<GatewayMessage> = {}): GatewayMessage {
  return {
    id: 'm1',
    channel_id: 'ch1',
    guild_id: GUILD,
    content: `hey <@${LYRA_DISCORD_USER_ID}> how do I deploy this?`,
    author: { id: 'u1', bot: false, username: 'alice' },
    mentions: [{ id: LYRA_DISCORD_USER_ID }],
    member: { roles: [MEMBER_ROLE] },
    ...over,
  }
}

function memoryStorage(init: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(init))
  return {
    get: async <T>(key: string) => store.get(key) as T | undefined,
    put: async (key: string, value: unknown) => {
      store.set(key, value)
    },
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('lyraThreadTitle', () => {
  it('strips a leading mention and yields a clean title', () => {
    expect(lyraThreadTitle(`<@123> how do I deploy this?`, 'alice')).toBe('How do I deploy this')
  })

  it('keeps the first sentence when it is long enough', () => {
    expect(lyraThreadTitle('How do I deploy this? And then we talk more about it.', 'alice')).toBe(
      'How do I deploy this',
    )
  })

  it('truncates long input on a word boundary with an ellipsis', () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')
    const title = lyraThreadTitle(long, 'alice')
    expect(title.endsWith('…')).toBe(true)
    expect(title.length).toBeLessThanOrEqual(100)
    const without = title.slice(0, -1)
    expect(without.length).toBeLessThanOrEqual(LYRA_THREAD_NAME_MAX)
    const capped = long.charAt(0).toUpperCase() + long.slice(1)
    expect(capped.startsWith(without)).toBe(true)
    expect(without.endsWith(' ')).toBe(false)
    expect(without.includes(' ')).toBe(true)
  })

  it('falls back to Question de <user> for mention-only or emoji-only content', () => {
    expect(lyraThreadTitle('<@123>', 'alice')).toBe('Question de alice')
    expect(lyraThreadTitle('<:wave:99>', 'alice')).toBe('Question de alice')
  })

  it('returns Question Circle when the username is absent', () => {
    expect(lyraThreadTitle('<@123>')).toBe('Question Circle')
    expect(lyraThreadTitle('<:wave:99>', '')).toBe('Question Circle')
  })

  it('never returns an empty string', () => {
    const inputs: Array<[string, string | undefined]> = [
      ['', undefined],
      ['   ', 'alice'],
      ['!!!', 'alice'],
      ['<@1>', undefined],
      ['<a:x:1>', ''],
      ['https://example.com/foo', 'bob'],
    ]
    for (const [content, user] of inputs) {
      const title = lyraThreadTitle(content, user)
      expect(title.length).toBeGreaterThan(0)
      expect(title.length).toBeLessThanOrEqual(100)
    }
  })
})

describe('resolveLyraReplyThread', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns existing_thread when position is present, with zero fetch calls', async () => {
    const fetchImpl = vi.fn()
    const globalFetch = vi.fn()
    vi.stubGlobal('fetch', globalFetch)
    const result = await resolveLyraReplyThread({
      token: 'bot-token',
      msg: msg({ position: 0 }),
      storage: memoryStorage(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(result).toEqual({ channelId: 'ch1', created: false, reason: 'existing_thread' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(globalFetch).not.toHaveBeenCalled()
  })

  it('returns existing_thread from a cached thread kind, with zero fetch calls', async () => {
    const fetchImpl = vi.fn()
    const globalFetch = vi.fn()
    vi.stubGlobal('fetch', globalFetch)
    const result = await resolveLyraReplyThread({
      token: 'bot-token',
      msg: msg(),
      storage: memoryStorage({ [LYRA_THREAD_KIND_KEY]: { ch1: 'thread' } }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(result).toEqual({ channelId: 'ch1', created: false, reason: 'existing_thread' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(globalFetch).not.toHaveBeenCalled()
  })

  it('creates a thread on a type-0 cache miss and writes channel into the cache', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ type: 0 }, 200))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ id: 'thread-99' }, 201)),
    )
    const storage = memoryStorage()
    const result = await resolveLyraReplyThread({
      token: 'bot-token',
      msg: msg(),
      storage,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(result).toEqual({ channelId: 'thread-99', created: true, reason: 'created' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(await storage.get(LYRA_THREAD_KIND_KEY)).toEqual({ ch1: 'channel' })
  })

  it('returns existing_thread when a cache-miss GET reports type 11', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ type: 11 }, 200))
    const globalFetch = vi.fn()
    vi.stubGlobal('fetch', globalFetch)
    const storage = memoryStorage()
    const result = await resolveLyraReplyThread({
      token: 'bot-token',
      msg: msg(),
      storage,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(result).toEqual({ channelId: 'ch1', created: false, reason: 'existing_thread' })
    expect(globalFetch).not.toHaveBeenCalled()
    expect(await storage.get(LYRA_THREAD_KIND_KEY)).toEqual({ ch1: 'thread' })
  })

  it('still creates after a failing GET and leaves the cache unwritten', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ id: 'thread-77' }, 201)),
    )
    const storage = memoryStorage()
    const result = await resolveLyraReplyThread({
      token: 'bot-token',
      msg: msg(),
      storage,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(result).toEqual({ channelId: 'thread-77', created: true, reason: 'created' })
    expect(await storage.get(LYRA_THREAD_KIND_KEY)).toBeUndefined()
  })

  it('falls back to the parent channel when thread creation fails', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ type: 0 }, 200))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('err', { status: 500 })),
    )
    const result = await resolveLyraReplyThread({
      token: 'bot-token',
      msg: msg(),
      storage: memoryStorage(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(result).toEqual({ channelId: 'ch1', created: false, reason: 'create_failed' })
  })

  it('returns no_token for a blank token with zero fetch calls', async () => {
    const fetchImpl = vi.fn()
    const globalFetch = vi.fn()
    vi.stubGlobal('fetch', globalFetch)
    const result = await resolveLyraReplyThread({
      token: '   ',
      msg: msg(),
      storage: memoryStorage(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(result).toEqual({ channelId: 'ch1', created: false, reason: 'no_token' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(globalFetch).not.toHaveBeenCalled()
  })
})

describe('scheduleLyraMentionForward thread channelId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('posts the created thread id and keeps exactly the 7 payload keys', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/threads')) return jsonResponse({ id: 'thread-42' }, 201)
      if (url.includes('/api/v10/channels/')) return jsonResponse({ type: 0 }, 200)
      return new Response(null, { status: 204 })
    })
    vi.stubGlobal('fetch', fetchImpl)
    const pending: Promise<unknown>[] = []
    scheduleLyraMentionForward(
      {
        webhookUrl: 'https://grok.example/hook',
        webhookSecret: 'sender-test',
        memberRoleId: MEMBER_ROLE,
        configuredGuildId: GUILD,
        botToken: 'bot-token',
        storage: memoryStorage(),
        waitUntil: (p) => pending.push(p),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      msg(),
    )
    await Promise.all(pending)
    const webhookCall = fetchImpl.mock.calls.find((call) =>
      String(call[0]).includes('grok.example'),
    )
    expect(webhookCall).toBeDefined()
    const body = JSON.parse(String((webhookCall?.[1] as RequestInit | undefined)?.body)) as Record<
      string,
      unknown
    >
    expect(body.channelId).toBe('thread-42')
    expect(body.messageId).toBe('m1')
    expect(Object.keys(body).sort()).toEqual([...LYRA_PAYLOAD_KEYS].sort())
    expect(LYRA_PAYLOAD_KEYS).toHaveLength(7)
  })
})
