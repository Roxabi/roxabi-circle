/**
 * Dispatch routing: which Gateway events reach the @Lyra webhook, and which never do.
 *
 * The webhook is the one path that hands guild traffic to an external brain, so the
 * boundary between it and the deterministic automations (temp voice, channel rules)
 * is a security-relevant invariant, not a detail.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleGatewayDispatch } from '../src/discord/gateway-handlers'
import type { Env } from '../src/types'

const GUILD = '1000000000000000001'
const WATCH = '1534225938185978117'
const NEWS = '1000000000000000003'
const DIGEST = '1534243223625793626'
const MEMBER_ROLE = '1000000000000000004'
const HOOK = 'https://grok.example/hook'

function env(): Env {
  return {
    DISCORD_BOT_TOKEN: 'bot-token',
    DISCORD_GUILD_ID: GUILD,
    DISCORD_MEMBER_ROLE_ID: MEMBER_ROLE,
    DISCORD_GITHUB_WATCH_CHANNEL_ID: WATCH,
    DISCORD_NEWS_ACTU_CHANNEL_ID: NEWS,
    DISCORD_DAILY_DIGEST_CHANNEL_ID: DIGEST,
    LYRA_GROK_WEBHOOK_URL: HOOK,
    LYRA_GROK_WEBHOOK_SECRET: 'crsr_test',
  } as unknown as Env
}

function memoryStorage() {
  const map = new Map<string, unknown>()
  return {
    get: async <T>(key: string) => map.get(key) as T | undefined,
    put: async (key: string, value: unknown) => {
      map.set(key, value)
    },
  } as unknown as DurableObjectStorage
}

function ctx(pending: Promise<unknown>[], storage: DurableObjectStorage = memoryStorage()) {
  let botUserId: string | null = 'bot-1'
  let session = { seq: 0 } as never
  return {
    env: env(),
    storage,
    getBotUserId: () => botUserId,
    setBotUserId: (id: string | null) => {
      botUserId = id
    },
    getSession: () => session,
    setSession: (s: never) => {
      session = s
    },
    saveSession: async () => {},
    enqueueVoice: async (fn: () => Promise<void>) => fn(),
    waitUntil: (p: Promise<unknown>) => pending.push(p),
    sleep: async () => {},
  }
}

function message(channelId: string, content: string) {
  return {
    id: 'msg-1',
    channel_id: channelId,
    guild_id: GUILD,
    content,
    author: { id: 'human-1', username: 'membre', bot: false },
    member: { roles: [MEMBER_ROLE] },
    mentions: [{ id: '1534228521420067046' }],
  }
}

type OutboundCall = { method: string; url: string; body?: string }

type CallRecorder = {
  impl: typeof fetch
  calls: OutboundCall[]
  webhookPosts: () => OutboundCall[]
  deletes: () => OutboundCall[]
  threadCreates: () => OutboundCall[]
}

/** Records every outbound call so we can separate Discord REST from the Grok webhook. */
function recorder(opts?: { denyThreads?: boolean }): CallRecorder {
  const calls: OutboundCall[] = []
  const threaded = new Set<string>()
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? init.body : undefined
    calls.push({ method, url, body })

    const created = /\/messages\/([^/]+)\/threads$/.exec(url)
    if (method === 'POST' && created) {
      if (opts?.denyThreads) {
        return new Response(JSON.stringify({ code: 50013, message: 'Missing Permissions' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        })
      }
      const messageId = created[1]!
      if (threaded.has(messageId)) {
        return new Response(JSON.stringify({ message: 'Thread already exists' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        })
      }
      threaded.add(messageId)
      return new Response(JSON.stringify({ id: messageId, type: 11 }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    }

    const channel = /\/channels\/([^/]+)$/.exec(url)
    if (method === 'GET' && channel) {
      if (opts?.denyThreads) {
        return new Response(JSON.stringify({ message: 'Unknown Channel' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        })
      }
      const id = channel[1]!
      if (threaded.has(id)) {
        return new Response(JSON.stringify({ id, type: 11 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ id, type: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ id: 'created-1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return {
    impl: impl as unknown as typeof fetch,
    calls,
    webhookPosts: () => calls.filter((c) => c.url === HOOK),
    deletes: () => calls.filter((c) => c.method === 'DELETE'),
    threadCreates: () => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/threads')),
  }
}

describe('handleGatewayDispatch — webhook boundary', () => {
  let rec: CallRecorder

  beforeEach(() => {
    rec = recorder()
    vi.stubGlobal('fetch', rec.impl)
  })

  it('never forwards voice events to the webhook', async () => {
    const pending: Promise<unknown>[] = []
    await handleGatewayDispatch(ctx(pending) as never, {
      t: 'VOICE_STATE_UPDATE',
      d: {
        guild_id: GUILD,
        channel_id: '1000000000000000009',
        user_id: 'human-1',
        session_id: 's',
      },
    })
    await Promise.all(pending)
    expect(rec.webhookPosts()).toHaveLength(0)
  })

  it('never forwards READY or RESUMED to the webhook', async () => {
    const pending: Promise<unknown>[] = []
    const c = ctx(pending)
    await handleGatewayDispatch(c as never, {
      t: 'READY',
      d: { user: { id: 'bot-1' }, session_id: 'sess-1' },
    })
    await handleGatewayDispatch(c as never, { t: 'RESUMED', d: {} })
    await Promise.all(pending)
    expect(rec.webhookPosts()).toHaveLength(0)
  })

  it('forwards a mention posted in an unmoderated channel', async () => {
    const pending: Promise<unknown>[] = []
    await handleGatewayDispatch(ctx(pending) as never, {
      t: 'MESSAGE_CREATE',
      d: message('1000000000000000099', '<@1534228521420067046> ton avis ?'),
    })
    await Promise.all(pending)
    expect(rec.webhookPosts()).toHaveLength(1)
    expect(rec.deletes()).toHaveLength(0)
  })

  it('does not forward a mention the channel rule deletes', async () => {
    vi.useFakeTimers()
    const pending: Promise<unknown>[] = []
    const run = handleGatewayDispatch(ctx(pending) as never, {
      t: 'MESSAGE_CREATE',
      d: message(WATCH, '<@1534228521420067046> tu en penses quoi ?'),
    })
    await vi.advanceTimersByTimeAsync(13_000)
    await run
    await Promise.all(pending)
    vi.useRealTimers()

    // The rule wins: the message is deleted and Lyra is never handed a ghost.
    expect(rec.deletes().length).toBeGreaterThan(0)
    expect(rec.webhookPosts()).toHaveLength(0)
    expect(rec.threadCreates()).toHaveLength(0)
  })

  it('still forwards a mention that satisfies the channel rule', async () => {
    vi.useFakeTimers()
    const pending: Promise<unknown>[] = []
    const run = handleGatewayDispatch(ctx(pending) as never, {
      t: 'MESSAGE_CREATE',
      d: message(WATCH, 'https://github.com/Roxabi/roxabi-circle <@1534228521420067046>'),
    })
    await vi.advanceTimersByTimeAsync(2_000)
    await run
    await Promise.all(pending)
    vi.useRealTimers()
    expect(rec.webhookPosts()).toHaveLength(1)
    expect(rec.deletes()).toHaveLength(0)
  })

  it('opens a public thread before forwarding a top-level mention', async () => {
    const pending: Promise<unknown>[] = []
    const parent = '1000000000000000099'
    await handleGatewayDispatch(ctx(pending) as never, {
      t: 'MESSAGE_CREATE',
      d: message(parent, '<@1534228521420067046> ton avis ?'),
    })
    await Promise.all(pending)

    const threadIdx = rec.calls.findIndex((c) => c.method === 'POST' && c.url.endsWith('/threads'))
    const hookIdx = rec.calls.findIndex((c) => c.url === HOOK)
    expect(threadIdx).toBeGreaterThanOrEqual(0)
    expect(hookIdx).toBeGreaterThan(threadIdx)

    const payload = JSON.parse(rec.webhookPosts()[0]?.body ?? '{}') as { channelId?: string }
    expect(payload.channelId).toBe('msg-1')
    expect(payload.channelId).not.toBe(parent)
  })

  it('forwards an in-thread mention without creating another thread', async () => {
    const pending: Promise<unknown>[] = []
    const threadId = '1000000000000000100'
    await handleGatewayDispatch(ctx(pending) as never, {
      t: 'MESSAGE_CREATE',
      d: {
        ...message(threadId, '<@1534228521420067046> suite'),
        position: 1,
      },
    })
    await Promise.all(pending)

    expect(rec.threadCreates()).toHaveLength(0)
    expect(rec.webhookPosts()).toHaveLength(1)
    const payload = JSON.parse(rec.webhookPosts()[0]?.body ?? '{}') as { channelId?: string }
    expect(payload.channelId).toBe(threadId)
  })

  it('adopts the automation thread instead of racing a second POST', async () => {
    vi.useFakeTimers()
    const pending: Promise<unknown>[] = []
    const run = handleGatewayDispatch(ctx(pending) as never, {
      t: 'MESSAGE_CREATE',
      d: message(WATCH, 'https://github.com/Roxabi/roxabi-circle <@1534228521420067046>'),
    })
    await vi.advanceTimersByTimeAsync(2_000)
    await run
    await Promise.all(pending)
    vi.useRealTimers()

    expect(rec.threadCreates()).toHaveLength(1)
    expect(rec.webhookPosts()).toHaveLength(1)
    const payload = JSON.parse(rec.webhookPosts()[0]?.body ?? '{}') as { channelId?: string }
    expect(payload.channelId).toBe('msg-1')
    expect(payload.channelId).not.toBe(WATCH)
  })

  it('still deletes a rejected top-level mention with no webhook and no thread', async () => {
    vi.useFakeTimers()
    const pending: Promise<unknown>[] = []
    const run = handleGatewayDispatch(ctx(pending) as never, {
      t: 'MESSAGE_CREATE',
      d: message(WATCH, '<@1534228521420067046> tu en penses quoi ?'),
    })
    await vi.advanceTimersByTimeAsync(13_000)
    await run
    await Promise.all(pending)
    vi.useRealTimers()

    expect(rec.deletes().length).toBeGreaterThan(0)
    expect(rec.webhookPosts()).toHaveLength(0)
    expect(rec.threadCreates()).toHaveLength(0)
  })

  it('does not forward an accepted link with no mention', async () => {
    const pending: Promise<unknown>[] = []
    await handleGatewayDispatch(ctx(pending) as never, {
      t: 'MESSAGE_CREATE',
      d: {
        ...message(WATCH, 'https://github.com/Roxabi/roxabi-circle'),
        mentions: [],
      },
    })
    await Promise.all(pending)

    expect(rec.threadCreates()).toHaveLength(1)
    expect(rec.webhookPosts()).toHaveLength(0)
  })

  it('stays silent when a ruled channel cannot open a thread', async () => {
    rec = recorder({ denyThreads: true })
    vi.stubGlobal('fetch', rec.impl)
    const pending: Promise<unknown>[] = []
    await handleGatewayDispatch(ctx(pending) as never, {
      t: 'MESSAGE_CREATE',
      d: message(WATCH, 'https://github.com/Roxabi/roxabi-circle <@1534228521420067046>'),
    })
    await Promise.all(pending)

    expect(rec.webhookPosts()).toHaveLength(0)
  })

  it('does not forward when a ruled-channel plan is ignore and thread creation fails', async () => {
    rec = recorder({ denyThreads: true })
    vi.stubGlobal('fetch', rec.impl)
    const pending: Promise<unknown>[] = []
    // github-watch `self`: author id is the gateway bot, so the plan is ignore
    // (not reject). The old accept-armed flag would leave the parent fallback live.
    await handleGatewayDispatch(ctx(pending) as never, {
      t: 'MESSAGE_CREATE',
      d: {
        ...message(WATCH, '<@1534228521420067046> ton avis ?'),
        author: { id: 'bot-1', username: 'gateway', bot: false },
      },
    })
    await Promise.all(pending)

    expect(rec.webhookPosts()).toHaveLength(0)
  })

  it('still posts to the parent when an unruled channel cannot open a thread', async () => {
    rec = recorder({ denyThreads: true })
    vi.stubGlobal('fetch', rec.impl)
    const pending: Promise<unknown>[] = []
    const parent = '1000000000000000099'
    await handleGatewayDispatch(ctx(pending) as never, {
      t: 'MESSAGE_CREATE',
      d: message(parent, '<@1534228521420067046> ton avis ?'),
    })
    await Promise.all(pending)

    expect(rec.webhookPosts()).toHaveLength(1)
    const payload = JSON.parse(rec.webhookPosts()[0]?.body ?? '{}') as { channelId?: string }
    expect(payload.channelId).toBe(parent)
  })

  it('forwards a later human message in a thread after Lyra has posted', async () => {
    const pending: Promise<unknown>[] = []
    const storage = memoryStorage()
    const threadId = '1000000000000000200'
    const dispatch = ctx(pending, storage)

    await handleGatewayDispatch(dispatch as never, {
      t: 'MESSAGE_CREATE',
      d: {
        ...message(threadId, 'Lyra reply'),
        author: { id: '1534228521420067046', username: 'Lyra', bot: true },
        mentions: [],
        position: 1,
      },
    })
    await Promise.all(pending)
    expect(rec.webhookPosts()).toHaveLength(0)

    pending.length = 0
    await handleGatewayDispatch(dispatch as never, {
      t: 'MESSAGE_CREATE',
      d: {
        ...message(threadId, 'and the rollback?'),
        id: 'msg-2',
        mentions: [],
        position: 2,
      },
    })
    await Promise.all(pending)
    expect(rec.webhookPosts()).toHaveLength(1)
    const payload = JSON.parse(rec.webhookPosts()[0]?.body ?? '{}') as {
      channelId?: string
      content?: string
    }
    expect(payload.channelId).toBe(threadId)
    expect(payload.content).toBe('and the rollback?')
    expect(rec.threadCreates()).toHaveLength(0)
  })

  it('does not forward an unmentioned thread message when Lyra never posted', async () => {
    const pending: Promise<unknown>[] = []
    await handleGatewayDispatch(ctx(pending) as never, {
      t: 'MESSAGE_CREATE',
      d: {
        ...message('1000000000000000201', 'anyone here?'),
        mentions: [],
        position: 1,
      },
    })
    await Promise.all(pending)
    expect(rec.webhookPosts()).toHaveLength(0)
  })
})
