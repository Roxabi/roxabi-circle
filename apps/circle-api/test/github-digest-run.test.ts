import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/discord/gateway', () => ({
  DiscordGateway: class DiscordGateway {},
}))

import { GITHUB_DIGEST_SCRAPE_ENABLED, runGithubDigest } from '../src/discord/github-digest'
import worker from '../src/index'
import type { Env } from '../src/types'

/**
 * Disabled-path guards: leftover cron / ops POST must not scrape GitHub or
 * post to #daily-digest. The every-15-min Gateway wake stays armed.
 */

const CHANNEL = 'chan-digest'
const OPS = 'ops-secret'

function env(extra: Partial<Env> = {}): Env {
  return {
    DISCORD_BOT_TOKEN: 'bot-token',
    DISCORD_DAILY_DIGEST_CHANNEL_ID: CHANNEL,
    GATEWAY_OPS_SECRET: OPS,
    ...extra,
  } as unknown as Env
}

function gatewayCalls(): { ns: DurableObjectNamespace; paths: string[] } {
  const paths: string[] = []
  const stub = {
    fetch: async (input: RequestInfo | URL) => {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      paths.push(new URL(href).pathname)
      return Response.json({ ok: true })
    },
  }
  const ns = {
    idFromName: () => ({}) as DurableObjectId,
    get: () => stub,
  } as unknown as DurableObjectNamespace
  return { ns, paths }
}

function waitCtx(pending: Promise<unknown>[]): ExecutionContext {
  return {
    waitUntil: (p: Promise<unknown>) => {
      pending.push(p)
    },
    passThroughOnException: () => {},
  } as ExecutionContext
}

function scheduled(cron: string): ScheduledController {
  return {
    cron,
    scheduledTime: Date.now(),
    noRetry() {},
  } as ScheduledController
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GITHUB_DIGEST_SCRAPE_ENABLED', () => {
  it('is compile-time off (no env re-arm)', () => {
    expect(GITHUB_DIGEST_SCRAPE_ENABLED).toBe(false)
  })
})

describe('runGithubDigest disabled path', () => {
  it('returns skipped:disabled and never fetches', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await runGithubDigest(env(), { skipTimeCheck: true })

    expect(res).toEqual({ ok: true, skipped: 'disabled' })
    expect(res.postedId).toBeUndefined()
    expect(res.picked).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stays disabled at the old 12:30 Paris slot', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await runGithubDigest(env(), {
      now: new Date('2026-08-22T10:30:00Z'),
    })

    expect(res).toEqual({ ok: true, skipped: 'disabled' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('POST /internal/github-digest', () => {
  it('rejects missing ops secret without I/O', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await worker.fetch(
      new Request('https://circle.roxabi.dev/internal/github-digest', {
        method: 'POST',
      }),
      env(),
      waitCtx([]),
    )

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns disabled and never scrapes or posts', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await worker.fetch(
      new Request('https://circle.roxabi.dev/internal/github-digest', {
        method: 'POST',
        headers: { 'X-Ops-Secret': OPS },
      }),
      env(),
      waitCtx([]),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, skipped: 'disabled' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('scheduled leftover digest crons', () => {
  it.each(['30 10 * * *', '30 11 * * *'] as const)(
    'no-ops %s without scrape or Gateway wake',
    async (cron) => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const { ns, paths } = gatewayCalls()
      const pending: Promise<unknown>[] = []

      await worker.scheduled(scheduled(cron), env({ DISCORD_GATEWAY: ns }), waitCtx(pending))
      await Promise.all(pending)

      expect(fetchMock).not.toHaveBeenCalled()
      expect(paths).toEqual([])
    },
  )

  it('still wakes Gateway on */15', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { ns, paths } = gatewayCalls()
    const pending: Promise<unknown>[] = []

    await worker.scheduled(
      scheduled('*/15 * * * *'),
      env({ DISCORD_GATEWAY: ns }),
      waitCtx(pending),
    )
    await Promise.all(pending)

    expect(paths).toContain('/ensure')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
