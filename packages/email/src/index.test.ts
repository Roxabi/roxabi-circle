import { describe, expect, it } from 'vitest'
import { buildDemoEmailText } from './index'

describe('buildDemoEmailText', () => {
  it('builds subject and text', () => {
    const m = buildDemoEmailText({ to: 'a@b.c', subjectId: 'u1' })
    expect(m.to).toBe('a@b.c')
    expect(m.subject).toContain('u1')
    expect(m.text.length).toBeGreaterThan(0)
  })
})
