import { afterEach, describe, expect, it, vi } from 'vitest'
import { runGithubDigest } from '../src/discord/github-digest'
import type { Env } from '../src/types'

/**
 * Guards the enrichment wiring, not the ranking: an unreadable candidate must
 * land in metaFailures and never be mistaken for a rejected one.
 */

const CHANNEL = 'chan-digest'

const trendingHtml = `
<article class="Box-row">
  <h2><a href="/acme/harness-one">acme / harness-one</a></h2>
  <p class="col-9">local multi-agent harness</p>
  <span itemprop="programmingLanguage">TypeScript</span>
  400 stars today
</article>
<article class="Box-row">
  <h2><a href="/acme/mcp-two">acme / mcp-two</a></h2>
  <p class="col-9">model context protocol mcp-server bridge</p>
  <span itemprop="programmingLanguage">Rust</span>
  900 stars this week
</article>
`

const repoMeta = {
  stargazers_count: 1200,
  forks_count: 20,
  created_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
  language: 'TypeScript',
  description: 'local multi-agent harness for coding agents',
  topics: ['agent', 'harness'],
  archived: false,
}

function env(): Env {
  return {
    DISCORD_BOT_TOKEN: 'bot-token',
    DISCORD_DAILY_DIGEST_CHANNEL_ID: CHANNEL,
  } as unknown as Env
}

/** Routes every fetch the runner makes; `metaStatus` drives the GitHub API answer. */
function router(metaStatus: number, posts: string[]) {
  return vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('discord.com') && init?.method === 'POST') {
      posts.push(String(init.body))
      return new Response(JSON.stringify({ id: 'posted-1' }), { status: 200 })
    }
    if (url.includes('discord.com')) {
      return new Response('[]', { status: 200 })
    }
    if (url.startsWith('https://github.com/trending')) {
      return new Response(trendingHtml, { status: 200 })
    }
    if (url.endsWith('/readme')) {
      return new Response('# harness\n\nlocal agent harness', { status: 200 })
    }
    if (url.startsWith('https://api.github.com/repos/')) {
      if (metaStatus !== 200) return new Response('nope', { status: metaStatus })
      return new Response(JSON.stringify(repoMeta), { status: 200 })
    }
    throw new Error(`unrouted fetch ${url}`)
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('runGithubDigest enrichment', () => {
  it('posts when candidate metadata is readable', async () => {
    const posts: string[] = []
    vi.stubGlobal('fetch', router(200, posts))

    const res = await runGithubDigest(env(), { skipTimeCheck: true })

    expect(res.ok).toBe(true)
    expect(res.error).toBeUndefined()
    expect(res.postedId).toBe('posted-1')
    expect(res.picked?.length).toBeGreaterThan(0)
    expect(res.metaFailures ?? 0).toBe(0)
    expect(posts).toHaveLength(1)
  })

  it('reports a rate limit instead of posting when GitHub answers 403', async () => {
    const posts: string[] = []
    vi.stubGlobal('fetch', router(403, posts))

    const res = await runGithubDigest(env(), { skipTimeCheck: true })

    expect(res.ok).toBe(false)
    expect(res.error).toBe('github_rate_limited')
    expect(res.metaFailures).toBeGreaterThan(0)
    expect(res.skipped).toBeUndefined()
    expect(posts).toHaveLength(0)
  })

  it('separates unreadable metadata from a rate limit on 500', async () => {
    const posts: string[] = []
    vi.stubGlobal('fetch', router(500, posts))

    const res = await runGithubDigest(env(), { skipTimeCheck: true })

    expect(res.ok).toBe(false)
    expect(res.error).toBe('github_meta_unavailable')
    expect(posts).toHaveLength(0)
  })
})
