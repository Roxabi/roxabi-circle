import { describe, expect, it } from 'vitest'
import {
  decideGithubWatchTopLevel,
  planGithubWatchMessage,
  threadNameFromGithubUrl,
} from '../src/discord/github-watch'

describe('decideGithubWatchTopLevel', () => {
  it('accepts a bare github repo URL', () => {
    const v = decideGithubWatchTopLevel('https://github.com/roxabi/roxabi-circle')
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.url).toContain('github.com/roxabi/roxabi-circle')
  })

  it('accepts PR URL with short caption', () => {
    const v = decideGithubWatchTopLevel(
      'worth a look https://github.com/foo/bar/pull/12',
    )
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.caption).toBe('worth a look')
  })

  it('accepts gist URL', () => {
    const v = decideGithubWatchTopLevel('https://gist.github.com/user/abcdef')
    expect(v.ok).toBe(true)
  })

  it('rejects empty', () => {
    const v = decideGithubWatchTopLevel('   ')
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('empty')
  })

  it('rejects no github url', () => {
    const v = decideGithubWatchTopLevel('https://gitlab.com/foo/bar check this')
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('no_github_url')
  })

  it('rejects multiple github urls', () => {
    const v = decideGithubWatchTopLevel(
      'https://github.com/a/b and https://github.com/c/d',
    )
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('multiple_urls')
  })

  it('rejects long caption', () => {
    const v = decideGithubWatchTopLevel(
      `${'x'.repeat(130)} https://github.com/a/b`,
    )
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('caption_too_long')
  })
})

describe('threadNameFromGithubUrl', () => {
  it('formats owner/repo', () => {
    expect(threadNameFromGithubUrl('https://github.com/acme/kit')).toBe('acme/kit')
  })
  it('formats PR', () => {
    expect(threadNameFromGithubUrl('https://github.com/acme/kit/pull/9')).toBe(
      'acme/kit PR9',
    )
  })
})

describe('planGithubWatchMessage', () => {
  const ch = '111'
  const base = {
    id: 'm1',
    channel_id: ch,
    content: 'https://github.com/a/b',
    author: { id: 'u1', bot: false },
  }

  it('ignores other channels', () => {
    const a = planGithubWatchMessage({ ...base, channel_id: 'other' }, ch)
    expect(a.type).toBe('ignore')
  })

  it('ignores bots', () => {
    const a = planGithubWatchMessage(
      { ...base, author: { id: 'b', bot: true } },
      ch,
    )
    expect(a.type).toBe('ignore')
  })

  it('accepts valid link', () => {
    const a = planGithubWatchMessage(base, ch)
    expect(a.type).toBe('accept')
  })

  it('rejects plain chat', () => {
    const a = planGithubWatchMessage({ ...base, content: 'salut le channel' }, ch)
    expect(a.type).toBe('reject')
  })
})
