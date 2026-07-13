import { describe, expect, it } from 'vitest'
import { buildDemoEmailText, sendLog } from './index'

describe('buildDemoEmailText', () => {
  it('builds subject and text', () => {
    const m = buildDemoEmailText({ to: 'a@b.c', subjectId: 'u1' })
    expect(m.to).toBe('a@b.c')
    expect(m.subject).toContain('u1')
    expect(m.text.length).toBeGreaterThan(0)
  })
})

describe('sendLog (edge-safe)', () => {
  it('returns ok log transport', () => {
    const r = sendLog({ to: 'a@b.c', subject: 'hi', text: 'body' })
    expect(r).toEqual({ ok: true, transport: 'log' })
  })
})
