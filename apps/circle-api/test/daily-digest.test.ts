import { describe, expect, it } from 'vitest'
import { planDailyDigestMessage, threadNameFromDigest } from '../src/discord/daily-digest'

describe('threadNameFromDigest', () => {
  it('uses first non-empty line', () => {
    expect(threadNameFromDigest('## Daily — 2026-08-10\n\nbody')).toBe('Daily — 2026-08-10')
  })

  it('falls back', () => {
    expect(threadNameFromDigest('   ')).toBe('Digest')
  })
})

describe('planDailyDigestMessage', () => {
  const ch = 'digest-ch'
  const base = {
    id: 'm1',
    channel_id: ch,
    content: 'hello',
    author: { id: 'u1', bot: false },
  }

  it('ignores other channels', () => {
    const a = planDailyDigestMessage({ ...base, channel_id: 'other' }, ch)
    expect(a.type).toBe('ignore')
  })

  it('rejects human top-level with thread guidance', () => {
    const a = planDailyDigestMessage(base, ch)
    expect(a.type).toBe('reject')
    if (a.type === 'reject') expect(a.message.toLowerCase()).toMatch(/thread/)
  })

  it('accepts long bot digest posts', () => {
    const content = '## Digest du jour — résumé des discussions et liens utiles du cercle'
    const a = planDailyDigestMessage({ ...base, content, author: { id: 'b1', bot: true } }, ch)
    expect(a.type).toBe('accept')
    if (a.type === 'accept') expect(a.threadName).toContain('Digest')
  })

  it('accepts bot embed digests', () => {
    const a = planDailyDigestMessage(
      { ...base, content: '', embeds: [{ title: 'Daily' }], author: { id: 'b1', bot: true } },
      ch,
    )
    expect(a.type).toBe('accept')
  })

  it('ignores short bot notices (reject notices)', () => {
    const a = planDailyDigestMessage(
      {
        ...base,
        content: '<@u1> — Dans **#daily-digest**, le top-level…',
        author: { id: 'lyra', bot: true },
      },
      ch,
    )
    expect(a.type).toBe('ignore')
  })
})
