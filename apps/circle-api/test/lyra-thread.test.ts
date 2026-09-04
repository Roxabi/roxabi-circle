import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GatewayMessage } from '../src/discord/github-watch'
import {
  LYRA_DISCORD_USER_ID,
  LYRA_PAYLOAD_KEYS,
  type PrivilegeStorage,
  scheduleLyraMentionForward,
} from '../src/discord/lyra-mention'
import {
  LYRA_THREAD_ADOPT_DELAY_MS,
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

function fetchMock(handler: (url: string) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => handler(String(input)))
}

/** Lone surrogate detector: the runtime lib here predates String.prototype.isWellFormed. */
function isWellFormed(value: string): boolean {
  return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)
}

async function resolveWith(
  fetchImpl: ReturnType<typeof vi.fn>,
  over: {
    msg?: GatewayMessage
    storage?: PrivilegeStorage
    adoptOnly?: boolean
    sleep?: (ms: number) => Promise<void>
    token?: string
    create?: Response | Error
  } = {},
) {
  const globalFetch = vi.fn(async () => {
    if (over.create instanceof Error) throw over.create
    return over.create ?? jsonResponse({ id: 'thread-99' }, 201)
  })
  vi.stubGlobal('fetch', globalFetch)
  const result = await resolveLyraReplyThread({
    token: over.token ?? 'bot-token',
    msg: over.msg ?? msg(),
    storage: over.storage ?? memoryStorage(),
    fetchImpl: fetchImpl as unknown as typeof fetch,
    adoptOnly: over.adoptOnly,
    sleep: over.sleep,
  })
  return { result, globalFetch }
}

async function postedPayload(storage: PrivilegeStorage, create: Error | 'ok' = 'ok') {
  const fetchImpl = fetchMock(async (url) => {
    if (url.includes('/threads')) return jsonResponse({ id: 'thread-42' }, 201)
    if (url.includes('/api/v10/channels/')) return jsonResponse({ type: 0 }, 200)
    return new Response(null, { status: 204 })
  })
  vi.stubGlobal(
    'fetch',
    create instanceof Error ? vi.fn(async () => Promise.reject(create)) : fetchImpl,
  )
  const pending: Promise<unknown>[] = []
  scheduleLyraMentionForward(
    {
      webhookUrl: 'https://grok.example/hook',
      webhookSecret: 'sender-test',
      memberRoleId: MEMBER_ROLE,
      configuredGuildId: GUILD,
      botToken: 'bot-token',
      storage,
      waitUntil: (p) => pending.push(p),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    },
    msg(),
  )
  await Promise.all(pending)
  const call = fetchImpl.mock.calls.find((c) => String(c[0]).includes('grok.example'))
  return JSON.parse(String((call?.[1] as RequestInit | undefined)?.body)) as Record<string, unknown>
}

async function runForward(over: {
  adoptThreadOnly?: boolean
  createStatus?: number
  msg?: GatewayMessage
  storage?: PrivilegeStorage
}): Promise<{ webhookPosts: number; channelId?: string }> {
  const fetchImpl = fetchMock(async (url) => {
    if (url.endsWith('/channels/m1')) return new Response('no', { status: 404 })
    if (url.includes('/api/v10/channels/')) return jsonResponse({ type: 0 }, 200)
    return new Response(null, { status: 204 })
  })
  const status = over.createStatus ?? 201
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      status === 201
        ? jsonResponse({ id: 'thread-99' }, 201)
        : jsonResponse({ message: 'err' }, status),
    ),
  )
  const pending: Promise<unknown>[] = []
  scheduleLyraMentionForward(
    {
      webhookUrl: 'https://grok.example/hook',
      webhookSecret: 'sender-test',
      memberRoleId: MEMBER_ROLE,
      configuredGuildId: GUILD,
      botToken: 'bot-token',
      adoptThreadOnly: over.adoptThreadOnly,
      sleep: async () => {},
      storage: over.storage ?? memoryStorage(),
      waitUntil: (p) => pending.push(p),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    },
    over.msg ?? msg(),
  )
  await Promise.all(pending)
  const hooks = fetchImpl.mock.calls.filter((c) => String(c[0]).includes('grok.example'))
  const init = hooks[0]?.[1]
  let channelId: string | undefined
  if (init && typeof init === 'object' && 'body' in init && init.body != null) {
    const parsed: unknown = JSON.parse(String(init.body))
    if (
      parsed &&
      typeof parsed === 'object' &&
      'channelId' in parsed &&
      typeof parsed.channelId === 'string'
    ) {
      channelId = parsed.channelId
    }
  }
  return { webhookPosts: hooks.length, channelId }
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
    expect((long.charAt(0).toUpperCase() + long.slice(1)).startsWith(without)).toBe(true)
    expect(without.endsWith(' ')).toBe(false)
    expect(without.includes(' ')).toBe(true)
  })
  it('falls back to Question de <user> for mention-only or emoji-only content', () => {
    expect(lyraThreadTitle('<@123>', 'alice')).toBe('Question de alice')
    expect(lyraThreadTitle('<:wave:99>', 'alice')).toBe('Question de alice')
    expect(lyraThreadTitle('<@&987654321098765432>', 'alice')).toBe('Question de alice')
    expect(lyraThreadTitle('<@123>')).toBe('Question Circle')
    expect(lyraThreadTitle('<:wave:99>', '')).toBe('Question Circle')
  })
  it('never returns an empty string', () => {
    for (const [content, user] of [
      ['', undefined],
      ['   ', 'alice'],
      ['!!!', 'alice'],
      ['<@1>', undefined],
      ['<a:x:1>', ''],
      ['https://example.com/foo', 'bob'],
    ] as Array<[string, string | undefined]>) {
      expect(lyraThreadTitle(content, user).length).toBeGreaterThan(0)
    }
  })
  it('does not emit a dangling surrogate when truncating', () => {
    const title = lyraThreadTitle(`${'x'.repeat(89)}\u{1F600}${'y'.repeat(20)}`, 'alice')
    expect(isWellFormed(title)).toBe(true)
    expect(title.length).toBeLessThanOrEqual(100)
  })
})

describe('resolveLyraReplyThread', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
  it('returns existing_thread when position is present, with zero fetch calls', async () => {
    const fetchImpl = fetchMock(async () => jsonResponse({ type: 0 }, 200))
    const { result, globalFetch } = await resolveWith(fetchImpl, { msg: msg({ position: 0 }) })
    expect(result).toEqual({ channelId: 'ch1', created: false, reason: 'existing_thread' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(globalFetch).not.toHaveBeenCalled()
  })
  it('returns existing_thread from a cached thread kind, with zero fetch calls', async () => {
    const fetchImpl = fetchMock(async () => jsonResponse({ type: 0 }, 200))
    const { result, globalFetch } = await resolveWith(fetchImpl, {
      storage: memoryStorage({ [LYRA_THREAD_KIND_KEY]: { ch1: 'thread' } }),
    })
    expect(result).toEqual({ channelId: 'ch1', created: false, reason: 'existing_thread' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(globalFetch).not.toHaveBeenCalled()
  })
  it('creates a thread on a type-0 cache miss and writes channel into the cache', async () => {
    const fetchImpl = fetchMock(async () => jsonResponse({ type: 0 }, 200))
    const storage = memoryStorage()
    const { result } = await resolveWith(fetchImpl, { storage })
    expect(result).toEqual({ channelId: 'thread-99', created: true, reason: 'created' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(await storage.get(LYRA_THREAD_KIND_KEY)).toEqual({ ch1: 'channel' })
  })
  it('returns existing_thread when a cache-miss GET reports type 11', async () => {
    const fetchImpl = fetchMock(async () => jsonResponse({ type: 11 }, 200))
    const storage = memoryStorage()
    const { result, globalFetch } = await resolveWith(fetchImpl, { storage })
    expect(result).toEqual({ channelId: 'ch1', created: false, reason: 'existing_thread' })
    expect(globalFetch).not.toHaveBeenCalled()
    expect(await storage.get(LYRA_THREAD_KIND_KEY)).toEqual({ ch1: 'thread' })
  })
  it('still creates after a failing GET and leaves the cache unwritten', async () => {
    const fetchImpl = fetchMock(async () => new Response('nope', { status: 500 }))
    const storage = memoryStorage()
    const { result } = await resolveWith(fetchImpl, { storage })
    expect(result).toEqual({ channelId: 'thread-99', created: true, reason: 'created' })
    expect(await storage.get(LYRA_THREAD_KIND_KEY)).toBeUndefined()
  })
  it('falls back to the parent channel when thread creation fails', async () => {
    const fetchImpl = fetchMock(async () => jsonResponse({ type: 0 }, 200))
    const { result } = await resolveWith(fetchImpl, {
      create: new Response('err', { status: 500 }),
    })
    expect(result).toEqual({ channelId: 'ch1', created: false, reason: 'create_failed' })
  })
  it('returns no_token for a blank token with zero fetch calls', async () => {
    const fetchImpl = fetchMock(async () => jsonResponse({ type: 0 }, 200))
    const { result, globalFetch } = await resolveWith(fetchImpl, { token: '   ' })
    expect(result).toEqual({ channelId: 'ch1', created: false, reason: 'no_token' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(globalFetch).not.toHaveBeenCalled()
  })
  it('still creates when position is an explicit null', async () => {
    const fetchImpl = fetchMock(async () => jsonResponse({ type: 0 }, 200))
    const { result } = await resolveWith(fetchImpl, {
      msg: { ...msg(), position: null } as unknown as GatewayMessage,
    })
    expect(result).toEqual({ channelId: 'thread-99', created: true, reason: 'created' })
  })
  it('adopts on the first poll without creating a thread', async () => {
    const fetchImpl = fetchMock(async () => jsonResponse({ type: 11 }, 200))
    const sleep = vi.fn(async () => {})
    const { result, globalFetch } = await resolveWith(fetchImpl, { adoptOnly: true, sleep })
    expect(result).toEqual({ channelId: 'm1', created: false, reason: 'adopted' })
    expect(globalFetch).not.toHaveBeenCalled()
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(LYRA_THREAD_ADOPT_DELAY_MS)
  })
  it('adopts when the thread appears on the second poll', async () => {
    let polls = 0
    const fetchImpl = fetchMock(async (url) => {
      if (!url.endsWith('/channels/m1')) return jsonResponse({ type: 0 }, 200)
      polls += 1
      return polls >= 2 ? jsonResponse({ type: 11 }, 200) : new Response('no', { status: 404 })
    })
    const sleep = vi.fn(async () => {})
    const { result, globalFetch } = await resolveWith(fetchImpl, { adoptOnly: true, sleep })
    expect(result).toEqual({ channelId: 'm1', created: false, reason: 'adopted' })
    expect(globalFetch).not.toHaveBeenCalled()
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(LYRA_THREAD_ADOPT_DELAY_MS)
  })
  it('falls through and creates when adoptOnly never sees the thread', async () => {
    const fetchImpl = fetchMock(async (url) =>
      url.endsWith('/channels/m1')
        ? new Response('no', { status: 404 })
        : jsonResponse({ type: 0 }, 200),
    )
    const { result } = await resolveWith(fetchImpl, { adoptOnly: true, sleep: async () => {} })
    expect(result).toEqual({ channelId: 'thread-99', created: true, reason: 'created' })
  })
  it('adopts an existing thread after a 400 create', async () => {
    const fetchImpl = fetchMock(async (url) =>
      url.endsWith('/channels/m1')
        ? jsonResponse({ type: 11 }, 200)
        : jsonResponse({ type: 0 }, 200),
    )
    const { result } = await resolveWith(fetchImpl, {
      create: jsonResponse({ message: 'exists' }, 400),
    })
    expect(result).toEqual({ channelId: 'm1', created: false, reason: 'adopted' })
  })
  it('keeps the newest half of the kind cache on overflow', async () => {
    const init: Record<string, 'thread' | 'channel'> = {}
    for (let i = 0; i < 64; i++) init[`old-${i}`] = 'channel'
    const storage = memoryStorage({ [LYRA_THREAD_KIND_KEY]: init })
    await resolveWith(
      fetchMock(async () => jsonResponse({ type: 0 }, 200)),
      { storage },
    )
    const written = await storage.get<Record<string, string>>(LYRA_THREAD_KIND_KEY)
    expect(written?.ch1).toBe('channel')
    expect(written?.['old-0']).toBeUndefined()
    expect(Object.keys(written ?? {}).length).toBeGreaterThan(1)
  })
  it('posts the created thread id and keeps exactly the 7 payload keys', async () => {
    const body = await postedPayload(memoryStorage())
    expect(body.channelId).toBe('thread-42')
    expect(body.messageId).toBe('m1')
    expect(Object.keys(body).sort()).toEqual([...LYRA_PAYLOAD_KEYS].sort())
    expect(LYRA_PAYLOAD_KEYS).toHaveLength(7)
  })
  it('still posts when storage.get rejects', async () => {
    const getBody = await postedPayload({
      get: async () => Promise.reject(new Error('kv get')),
      put: async () => {},
    })
    expect(getBody.channelId).toBe('thread-42')
  })
  it('still posts when storage.put rejects', async () => {
    const putBody = await postedPayload({
      get: async () => undefined,
      put: async () => Promise.reject(new Error('kv put')),
    })
    expect(putBody.channelId).toBe('thread-42')
  })
  it('still posts the parent channel when createThreadOnMessage rejects', async () => {
    expect((await postedPayload(memoryStorage(), new Error('network'))).channelId).toBe('ch1')
  })
  it('returns no_thread and skips the webhook when adoptOnly create is 403', async () => {
    const fetchImpl = fetchMock(async (url) =>
      url.endsWith('/channels/m1')
        ? new Response('no', { status: 404 })
        : jsonResponse({ type: 0 }, 200),
    )
    const { result } = await resolveWith(fetchImpl, {
      adoptOnly: true,
      sleep: async () => {},
      create: jsonResponse({ code: 50013, message: 'Missing Permissions' }, 403),
    })
    expect(result).toEqual({ channelId: 'ch1', created: false, reason: 'no_thread' })
    expect(await runForward({ adoptThreadOnly: true, createStatus: 403 })).toEqual({
      webhookPosts: 0,
      channelId: undefined,
    })
  })
  it('returns no_thread and skips the webhook when adoptOnly create is 429', async () => {
    const fetchImpl = fetchMock(async (url) =>
      url.endsWith('/channels/m1')
        ? new Response('no', { status: 404 })
        : jsonResponse({ type: 0 }, 200),
    )
    const { result } = await resolveWith(fetchImpl, {
      adoptOnly: true,
      sleep: async () => {},
      create: jsonResponse({ retry_after: 1 }, 429),
    })
    expect(result).toEqual({ channelId: 'ch1', created: false, reason: 'no_thread' })
    expect(await runForward({ adoptThreadOnly: true, createStatus: 429 })).toEqual({
      webhookPosts: 0,
      channelId: undefined,
    })
  })
  it('posts to the parent on create_failed when not adoptOnly', async () => {
    const fetchImpl = fetchMock(async (url) =>
      url.endsWith('/channels/m1')
        ? new Response('no', { status: 404 })
        : jsonResponse({ type: 0 }, 200),
    )
    const { result } = await resolveWith(fetchImpl, {
      create: jsonResponse({ code: 50013, message: 'Missing Permissions' }, 403),
    })
    expect(result).toEqual({ channelId: 'ch1', created: false, reason: 'create_failed' })
    expect(await runForward({ createStatus: 403 })).toEqual({
      webhookPosts: 1,
      channelId: 'ch1',
    })
  })
  it('skips the webhook when the resolver rejects under adoptThreadOnly', async () => {
    const exploding = msg()
    Object.defineProperty(exploding, 'position', {
      get(): never {
        throw new Error('resolver exploded')
      },
    })
    expect(await runForward({ adoptThreadOnly: true, msg: exploding })).toEqual({
      webhookPosts: 0,
      channelId: undefined,
    })
  })
  it('does not reject when storage.get throws synchronously', async () => {
    const storage: PrivilegeStorage = {
      get: () => {
        throw new Error('sync get')
      },
      put: async () => {},
    }
    await expect(
      resolveWith(
        fetchMock(async () => jsonResponse({ type: 0 }, 200)),
        { storage },
      ),
    ).resolves.toMatchObject({
      result: { channelId: 'thread-99', created: true, reason: 'created' },
    })
  })
  it('sleeps before the first adopt GET', async () => {
    const order: string[] = []
    const fetchImpl = fetchMock(async (url) => {
      if (url.endsWith('/channels/m1')) {
        order.push('get')
        return jsonResponse({ type: 11 }, 200)
      }
      return jsonResponse({ type: 0 }, 200)
    })
    const sleep = vi.fn(async () => {
      order.push('sleep')
    })
    const { result } = await resolveWith(fetchImpl, { adoptOnly: true, sleep })
    expect(result).toEqual({ channelId: 'm1', created: false, reason: 'adopted' })
    expect(order[0]).toBe('sleep')
    expect(order).toEqual(['sleep', 'get'])
  })
})
