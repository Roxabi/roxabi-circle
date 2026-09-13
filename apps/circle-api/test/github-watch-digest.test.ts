import { describe, expect, it, vi } from 'vitest'
import type { GatewayMessage } from '../src/discord/github-watch'
import {
  extractGithubRepoUrl,
  GITHUB_WATCH_DIGEST_PAYLOAD_KEYS,
  GITHUB_WATCH_DIGEST_SOURCE,
  normalizeGithubRepoUrl,
  planGithubWatchDigestForward,
  postGithubWatchDigestWebhook,
  scheduleGithubWatchDigestForward,
} from '../src/discord/github-watch-digest'

const GUILD = 'guild-1'
const WATCH = '1534225938185978117'
const HOOK = 'https://grok.example/github-watch'

function msg(over: Partial<GatewayMessage> = {}): GatewayMessage {
  return {
    id: 'm1',
    channel_id: WATCH,
    guild_id: GUILD,
    content: 'https://github.com/Roxabi/roxabi-circle',
    author: { id: 'u1', bot: false, username: 'alice' },
    ...over,
  }
}

function plan(over: Partial<GatewayMessage> = {}, extra: { webhookUrl?: string | null } = {}) {
  return planGithubWatchDigestForward({
    msg: msg(over),
    webhookUrl: extra.webhookUrl === undefined ? HOOK : extra.webhookUrl,
    watchChannelId: WATCH,
    configuredGuildId: GUILD,
  })
}

function ignoreReason(action: ReturnType<typeof planGithubWatchDigestForward>): string | undefined {
  return action.type === 'ignore' ? action.reason : undefined
}

describe('normalizeGithubRepoUrl', () => {
  it('canonicalizes owner/repo and strips .git / slash / query', () => {
    expect(normalizeGithubRepoUrl('https://github.com/Roxabi/roxabi-circle')).toBe(
      'https://github.com/Roxabi/roxabi-circle',
    )
    expect(normalizeGithubRepoUrl('https://www.github.com/Roxabi/roxabi-circle.git')).toBe(
      'https://github.com/Roxabi/roxabi-circle',
    )
    expect(normalizeGithubRepoUrl('http://github.com/Roxabi/roxabi-circle/')).toBe(
      'https://github.com/Roxabi/roxabi-circle',
    )
    expect(
      normalizeGithubRepoUrl('https://github.com/Roxabi/roxabi-circle?tab=readme-ov-file'),
    ).toBe('https://github.com/Roxabi/roxabi-circle')
  })

  it('rejects issues, PRs, trees, and reserved first segments', () => {
    expect(normalizeGithubRepoUrl('https://github.com/Roxabi/roxabi-circle/issues/1')).toBeNull()
    expect(normalizeGithubRepoUrl('https://github.com/Roxabi/roxabi-circle/pull/22')).toBeNull()
    expect(normalizeGithubRepoUrl('https://github.com/Roxabi/roxabi-circle/tree/main')).toBeNull()
    expect(normalizeGithubRepoUrl('https://gist.github.com/user/abcdef')).toBeNull()
    expect(normalizeGithubRepoUrl('https://github.com/orgs/Roxabi')).toBeNull()
    expect(normalizeGithubRepoUrl('https://gitlab.com/Roxabi/roxabi-circle')).toBeNull()
  })
})

describe('extractGithubRepoUrl', () => {
  it('picks the first repo URL and ignores surrounding caption / punctuation', () => {
    expect(extractGithubRepoUrl('worth a look https://github.com/acme/kit.')).toBe(
      'https://github.com/acme/kit',
    )
    expect(extractGithubRepoUrl('<https://github.com/acme/kit>')).toBe(
      'https://github.com/acme/kit',
    )
  })

  it('skips issue/PR-only content and empty text', () => {
    expect(extractGithubRepoUrl('https://github.com/acme/kit/pull/9')).toBeNull()
    expect(extractGithubRepoUrl('pas de lien')).toBeNull()
    expect(extractGithubRepoUrl(null)).toBeNull()
  })
})

describe('planGithubWatchDigestForward', () => {
  it('no-ops when webhook is unset or blank', () => {
    const base = { msg: msg(), watchChannelId: WATCH, configuredGuildId: GUILD }
    expect(ignoreReason(planGithubWatchDigestForward({ ...base }))).toBe('no_webhook')
    expect(ignoreReason(planGithubWatchDigestForward({ ...base, webhookUrl: '' }))).toBe(
      'no_webhook',
    )
    expect(ignoreReason(planGithubWatchDigestForward({ ...base, webhookUrl: '   ' }))).toBe(
      'no_webhook',
    )
  })

  it('ignores other channels, bots, webhooks, and non-repo links', () => {
    expect(ignoreReason(plan({ channel_id: 'other' }))).toBe('other_channel')
    expect(ignoreReason(plan({ author: { id: 'b', bot: true } }))).toBe('bot')
    expect(ignoreReason(plan({ webhook_id: 'wh-1' }))).toBe('webhook')
    expect(ignoreReason(plan({ content: 'https://github.com/acme/kit/issues/3' }))).toBe('no_repo')
    expect(ignoreReason(plan({ guild_id: 'other' }))).toBe('other_guild')
  })

  it('forwards a repo URL with exact payload keys', () => {
    const a = plan()
    expect(a.type).toBe('forward')
    if (a.type !== 'forward') return
    expect(Object.keys(a.payload).sort()).toEqual([...GITHUB_WATCH_DIGEST_PAYLOAD_KEYS].sort())
    expect(a.payload).toEqual({
      source: GITHUB_WATCH_DIGEST_SOURCE,
      guildId: GUILD,
      channelId: WATCH,
      messageId: 'm1',
      url: 'https://github.com/Roxabi/roxabi-circle',
      authorId: 'u1',
      authorUsername: 'alice',
    })
  })
})

describe('scheduleGithubWatchDigestForward', () => {
  it('does not POST when webhook URL is empty', async () => {
    const fetchImpl = vi.fn()
    const pending: Promise<unknown>[] = []
    scheduleGithubWatchDigestForward(
      {
        webhookUrl: '',
        webhookSecret: 'sender-test',
        watchChannelId: WATCH,
        configuredGuildId: GUILD,
        waitUntil: (p) => pending.push(p),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      msg(),
    )
    await Promise.all(pending)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not POST when sender key is empty', async () => {
    const fetchImpl = vi.fn()
    const pending: Promise<unknown>[] = []
    scheduleGithubWatchDigestForward(
      {
        webhookUrl: HOOK,
        webhookSecret: '',
        watchChannelId: WATCH,
        configuredGuildId: GUILD,
        waitUntil: (p) => pending.push(p),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      msg(),
    )
    await Promise.all(pending)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not POST a PR-only message', async () => {
    const fetchImpl = vi.fn()
    const pending: Promise<unknown>[] = []
    scheduleGithubWatchDigestForward(
      {
        webhookUrl: HOOK,
        webhookSecret: 'sender-test',
        watchChannelId: WATCH,
        configuredGuildId: GUILD,
        waitUntil: (p) => pending.push(p),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      msg({ content: 'https://github.com/acme/kit/pull/12' }),
    )
    await Promise.all(pending)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('POSTs JSON via waitUntil with Bearer and exact keys', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const pending: Promise<unknown>[] = []
    scheduleGithubWatchDigestForward(
      {
        webhookUrl: HOOK,
        webhookSecret: 'sender-test',
        watchChannelId: WATCH,
        configuredGuildId: GUILD,
        waitUntil: (p) => pending.push(p),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      msg(),
    )
    await Promise.all(pending)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(call[0]).toBe(HOOK)
    expect(call[1]?.method).toBe('POST')
    const headers = call[1]?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sender-test')
    const body = JSON.parse(String(call[1]?.body)) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual([...GITHUB_WATCH_DIGEST_PAYLOAD_KEYS].sort())
    expect(body).toMatchObject({
      source: GITHUB_WATCH_DIGEST_SOURCE,
      url: 'https://github.com/Roxabi/roxabi-circle',
      authorId: 'u1',
    })
  })

  it('does not throw on fetch failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network')
    })
    const pending: Promise<unknown>[] = []
    scheduleGithubWatchDigestForward(
      {
        webhookUrl: HOOK,
        webhookSecret: 'sender-test',
        watchChannelId: WATCH,
        configuredGuildId: GUILD,
        waitUntil: (p) => pending.push(p),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      msg(),
    )
    await expect(Promise.all(pending)).resolves.toBeDefined()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('postGithubWatchDigestWebhook', () => {
  it('does not throw on HTTP error', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 502 }))
    await expect(
      postGithubWatchDigestWebhook(
        HOOK,
        {
          source: GITHUB_WATCH_DIGEST_SOURCE,
          guildId: GUILD,
          channelId: WATCH,
          messageId: 'm1',
          url: 'https://github.com/Roxabi/roxabi-circle',
          authorId: 'u1',
          authorUsername: 'alice',
        },
        fetchImpl as unknown as typeof fetch,
        'sender-test',
      ),
    ).resolves.toBeUndefined()
  })
})
