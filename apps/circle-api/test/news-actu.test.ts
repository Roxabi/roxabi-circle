import { describe, expect, it } from 'vitest'
import {
  decideNewsActuTopLevel,
  planNewsActuMessage,
  threadNameFromUrl,
} from '../src/discord/news-actu'

describe('decideNewsActuTopLevel', () => {
  it('accepts a bare http(s) URL', () => {
    const v = decideNewsActuTopLevel('https://www.theverge.com/ai-news/123')
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.url).toContain('theverge.com')
  })

  it('accepts URL with short caption', () => {
    const v = decideNewsActuTopLevel('intéressant https://news.ycombinator.com/item?id=1')
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.caption).toBe('intéressant')
  })

  it('accepts http (non-TLS)', () => {
    const v = decideNewsActuTopLevel('http://example.com/post')
    expect(v.ok).toBe(true)
  })

  it('rejects empty', () => {
    const v = decideNewsActuTopLevel('   ')
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('empty')
  })

  it('rejects plain chat (no link)', () => {
    const v = decideNewsActuTopLevel('vous avez vu le paper de ce matin ?')
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.code).toBe('no_url')
      expect(v.message.toLowerCase()).toMatch(/thread/)
    }
  })

  it('rejects multiple urls', () => {
    const v = decideNewsActuTopLevel('https://a.com/x and https://b.com/y')
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('multiple_urls')
  })

  it('rejects long caption', () => {
    const v = decideNewsActuTopLevel(`${'x'.repeat(130)} https://example.com/a`)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('caption_too_long')
  })

  it('dedupes identical urls', () => {
    const v = decideNewsActuTopLevel('https://example.com/a see also https://example.com/a')
    expect(v.ok).toBe(true)
  })
})

describe('threadNameFromUrl', () => {
  it('uses host and path slug', () => {
    expect(threadNameFromUrl('https://www.techcrunch.com/2026/08/foo-bar')).toContain(
      'techcrunch.com',
    )
  })

  it('falls back on host only', () => {
    expect(threadNameFromUrl('https://example.com/')).toBe('example.com')
  })
})

describe('planNewsActuMessage', () => {
  const ch = '222'
  const base = {
    id: 'm1',
    channel_id: ch,
    content: 'https://example.com/story',
    author: { id: 'u1', bot: false },
  }

  it('ignores other channels', () => {
    const a = planNewsActuMessage({ ...base, channel_id: 'other' }, ch)
    expect(a.type).toBe('ignore')
  })

  it('ignores bots', () => {
    const a = planNewsActuMessage({ ...base, author: { id: 'b', bot: true } }, ch)
    expect(a.type).toBe('ignore')
  })

  it('accepts valid link', () => {
    const a = planNewsActuMessage(base, ch)
    expect(a.type).toBe('accept')
    if (a.type === 'accept') expect(a.threadName.length).toBeGreaterThan(0)
  })

  it('rejects plain chat with thread guidance', () => {
    const a = planNewsActuMessage({ ...base, content: 'salut le channel' }, ch)
    expect(a.type).toBe('reject')
    if (a.type === 'reject') expect(a.message.toLowerCase()).toMatch(/thread/)
  })
})
