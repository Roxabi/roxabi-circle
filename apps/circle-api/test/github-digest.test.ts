import { describe, expect, it } from 'vitest'
import { formatDigestMessage } from '../src/discord/github-digest-copy'
import {
  alreadyPostedToday,
  classifyBucket,
  type DigestRepo,
  dropReasons,
  extractPostedRepos,
  isDigestCron,
  isParisDigestSlot,
  mergeTrending,
  parisDigestDateLabel,
  parseTrendingHtml,
  pickDigest,
  readmeExcerpt,
} from '../src/discord/github-digest-logic'

const sampleHtml = `
<article class="Box-row">
  <h2><a href="/chaitanyagiri/munder-difflin">chaitanyagiri / munder-difflin</a></h2>
  <p class="col-9 color-fg-muted my-1 pr-4">local multi-agent harness</p>
  <span itemprop="programmingLanguage">TypeScript</span>
  344 stars today
</article>
<article class="Box-row">
  <h2><a href="/sponsors/obra">sponsor</a></h2>
</article>
<article class="Box-row">
  <h2><a href="/cactus-compute/needle">cactus-compute / needle</a></h2>
  <p class="col-9">14MB foundation model for tiny devices</p>
  3,409 stars this week
</article>
`

function repo(partial: Partial<DigestRepo> & Pick<DigestRepo, 'full' | 'bucket'>): DigestRepo {
  return {
    owner: partial.full.split('/')[0]!,
    name: partial.full.split('/')[1]!,
    url: `https://github.com/${partial.full}`,
    desc: partial.desc ?? 'agent harness for coding agents',
    lang: 'TypeScript',
    deltaDaily: 100,
    deltaWeekly: 800,
    stars: 2000,
    forks: 100,
    created: '2026-06-01T00:00:00Z',
    ageDays: 80,
    topics: ['harness'],
    archived: false,
    readmeExcerpt: '',
    relWeek: 0.4,
    relDay: 0.05,
    ...partial,
  }
}

describe('parseTrendingHtml', () => {
  it('extracts owner/repo, desc, daily stars; skips sponsors', () => {
    const hits = parseTrendingHtml(sampleHtml, 'daily')
    expect(hits.map((h) => h.full)).toEqual([
      'chaitanyagiri/munder-difflin',
      'cactus-compute/needle',
    ])
    expect(hits[0]?.deltaDaily).toBe(344)
    expect(hits[0]?.desc).toContain('harness')
    expect(hits[1]?.deltaDaily).toBe(3409)
  })

  it('sets weekly delta', () => {
    const hits = parseTrendingHtml(sampleHtml, 'weekly')
    expect(hits[1]?.deltaWeekly).toBe(3409)
    expect(hits[1]?.deltaDaily).toBeNull()
  })
})

describe('mergeTrending', () => {
  it('merges daily+weekly deltas', () => {
    const daily = parseTrendingHtml(sampleHtml, 'daily')
    const weekly = parseTrendingHtml(sampleHtml, 'weekly')
    const m = mergeTrending(daily, weekly)
    const needle = m.find((h) => h.full === 'cactus-compute/needle')
    expect(needle?.deltaDaily).toBe(3409)
    expect(needle?.deltaWeekly).toBe(3409)
  })
})

describe('isParisDigestSlot', () => {
  it('matches 12:30 CEST (10:30 UTC in August)', () => {
    expect(isParisDigestSlot(new Date('2026-08-22T10:30:00Z'))).toBe(true)
    expect(isParisDigestSlot(new Date('2026-08-22T11:30:00Z'))).toBe(false)
  })

  it('matches 12:30 CET (11:30 UTC in January)', () => {
    expect(isParisDigestSlot(new Date('2026-01-15T11:30:00Z'))).toBe(true)
    expect(isParisDigestSlot(new Date('2026-01-15T10:30:00Z'))).toBe(false)
  })
})

describe('isDigestCron', () => {
  it('accepts the two UTC slots only', () => {
    expect(isDigestCron('30 10 * * *')).toBe(true)
    expect(isDigestCron('30 11 * * *')).toBe(true)
    expect(isDigestCron('*/15 * * * *')).toBe(false)
  })
})

describe('dropReasons', () => {
  it('drops monuments and already posted', () => {
    const r = repo({
      full: 'obra/superpowers',
      bucket: 'skills',
      desc: 'agentic skills framework',
      stars: 200_000,
      relWeek: 0.01,
      ageDays: 300,
    })
    expect(dropReasons(r, new Set())).toContain('monument')
    expect(
      dropReasons(repo({ full: 'foo/bar', bucket: 'harness' }), new Set(['foo/bar'])),
    ).toContain('posted')
  })

  it('keeps high daily slope even if older than 90d', () => {
    const r = repo({
      full: 'agent-substrate/substrate',
      bucket: 'agent',
      desc: 'runtime for large scale agent deployments',
      ageDays: 100,
      relWeek: 0,
      relDay: 0.15,
      deltaWeekly: null,
      deltaDaily: 245,
      stars: 1572,
    })
    expect(dropReasons(r, new Set())).toEqual([])
  })

  it('drops vless/proxy farms', () => {
    const r = repo({
      full: 'x/y',
      bucket: 'cloudflare',
      desc: 'cloudflare workers vless trojan proxy',
      topics: ['vless'],
    })
    expect(dropReasons(r, new Set())).toContain('farm')
  })
})

describe('classifyBucket + pickDigest', () => {
  it('prefers one repo per bucket', () => {
    const picked = pickDigest([
      repo({ full: 'a/harness1', bucket: 'harness', deltaWeekly: 900 }),
      repo({ full: 'a/harness2', bucket: 'harness', deltaWeekly: 800 }),
      repo({
        full: 'b/needle',
        bucket: 'llm',
        desc: 'on-device llm inference',
        deltaWeekly: 700,
      }),
    ])
    expect(picked.map((p) => p.full)).toEqual(['a/harness1', 'b/needle', 'a/harness2'])
  })

  it('maps mcp vs harness', () => {
    expect(classifyBucket('model context protocol mcp-server')).toBe('mcp')
    expect(classifyBucket('multi-agent harness claude-code')).toBe('harness')
  })
})

describe('extractPostedRepos + alreadyPostedToday', () => {
  it('pulls owner/repo from messages in the window', () => {
    const set = extractPostedRepos(
      [
        {
          content: 'see https://github.com/chenyme/grok2api please',
          timestamp: '2026-08-18T07:00:00Z',
        },
        {
          content: 'https://github.com/old/repo',
          timestamp: '2026-07-01T00:00:00Z',
        },
      ],
      Date.parse('2026-08-15T00:00:00Z'),
    )
    expect([...set]).toEqual(['chenyme/grok2api'])
  })

  it('detects today heading', () => {
    const label = '22 août 2026'
    expect(alreadyPostedToday([{ content: `## GitHub qui décolle — ${label}\n` }], label)).toBe(
      true,
    )
    expect(alreadyPostedToday([{ content: 'hello' }], label)).toBe(false)
  })
})

describe('formatDigestMessage', () => {
  it('wraps URLs, stays under 2000, includes when/context', () => {
    const label = parisDigestDateLabel(new Date('2026-08-22T10:30:00Z'))
    const body = formatDigestMessage(
      [
        repo({
          full: 'chaitanyagiri/munder-difflin',
          bucket: 'harness',
          desc: 'local multi-agent harness wrapping Claude Code / Codex',
        }),
      ],
      label,
    )
    expect(body).toContain('GitHub qui décolle —')
    expect(body).toContain('<https://github.com/chaitanyagiri/munder-difflin>')
    expect(body).not.toMatch(/(?<!<)https:\/\/github.com\/chaitanyagiri/)
    expect(body).toMatch(/Quand/)
    expect(body).toMatch(/Contexte/)
    expect(body.length).toBeLessThanOrEqual(2000)
  })
})

describe('readmeExcerpt', () => {
  it('skips headings and images', () => {
    const md = `# Title\n\n![banner](x.png)\n\nNeedle is a 14MB on-device model.\n\nMore.`
    expect(readmeExcerpt(md)).toContain('14MB')
    expect(readmeExcerpt(md)).not.toContain('#')
  })
})
