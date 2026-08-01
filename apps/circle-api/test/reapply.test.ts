import { describe, expect, it } from 'vitest'
import { acceptDm, rejectDm } from '../src/lib/messages-fr'
import {
  canReapply,
  cooldownLabelFr,
  FIRST_REJECT_COOLDOWN_MS,
  LATER_REJECT_COOLDOWN_MS,
  nextEligibleAtMs,
} from '../src/lib/reapply'

describe('reapply policy', () => {
  const t0 = Date.UTC(2026, 0, 1, 12, 0, 0)

  it('first reject → 48h cooldown', () => {
    expect(nextEligibleAtMs(0, t0)).toBe(t0 + FIRST_REJECT_COOLDOWN_MS)
    expect(canReapply(0, t0, t0 + FIRST_REJECT_COOLDOWN_MS - 1)).toBe(false)
    expect(canReapply(0, t0, t0 + FIRST_REJECT_COOLDOWN_MS)).toBe(true)
    expect(cooldownLabelFr(0)).toBe('48 heures')
  })

  it('second+ reject → 15d cooldown', () => {
    expect(nextEligibleAtMs(1, t0)).toBe(t0 + LATER_REJECT_COOLDOWN_MS)
    expect(nextEligibleAtMs(5, t0)).toBe(t0 + LATER_REJECT_COOLDOWN_MS)
    expect(canReapply(1, t0, t0 + LATER_REJECT_COOLDOWN_MS - 1)).toBe(false)
    expect(canReapply(1, t0, t0 + LATER_REJECT_COOLDOWN_MS)).toBe(true)
    expect(cooldownLabelFr(1)).toBe('15 jours')
  })
})

describe('messages FR — no criteria leaks', () => {
  it('reject shows score and cooldown, not axes', () => {
    const msg = rejectDm({ score: 42, priorRejectCount: 0 })
    expect(msg).toContain('42/100')
    expect(msg).toContain('48 heures')
    expect(msg).toContain('15 jours')
    expect(msg).toContain('#appeal')
    expect(msg.toLowerCase()).not.toMatch(/volume|structure|activité|activity|oss|keyword/)
  })

  it('accept shows score only', () => {
    const msg = acceptDm(71.5)
    expect(msg).toContain('71.5/100')
    expect(msg.toLowerCase()).not.toMatch(/volume|axe|critère/)
  })
})
