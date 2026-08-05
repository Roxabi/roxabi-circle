import { describe, expect, it } from 'vitest'
import { keywordAffinity } from '../src/scoring/ai-keywords'
import { scoreProfile } from '../src/scoring/score'
import type { ProfileSignals } from '../src/types'

function base(over: Partial<ProfileSignals> = {}): ProfileSignals {
  return {
    githubId: 1,
    login: 'dev',
    accountAgeDays: 400,
    publicReposOwned: 12,
    technicalReposOwned: 10,
    totalAdditions: 40_000,
    totalDeletions: 10_000,
    totalStarsOnOwned: 80,
    daysSinceLastPush: 5,
    publicEvents90d: 40,
    activeMonths12: 10,
    structureMean: 0.75,
    aiAffinity: 0.7,
    externalMergedPrs: 8,
    publicOrgCount: 2,
    collabReposCount: 5,
    orgPushEvents: 12,
    ...over,
  }
}

describe('scoreProfile specialty model', () => {
  it('accepts strong craft-only artisan (ecosystem ~0)', () => {
    const report = scoreProfile(
      base({
        technicalReposOwned: 15,
        publicReposOwned: 16,
        totalAdditions: 80_000,
        totalStarsOnOwned: 40,
        structureMean: 0.85,
        externalMergedPrs: 0,
        publicOrgCount: 0,
        collabReposCount: 0,
        orgPushEvents: 0,
        aiAffinity: 0.5,
      }),
      { acceptThreshold: 65 },
    )
    expect(report.path).toBe('craft')
    expect(report.specialty).toBeGreaterThanOrEqual(0.45)
    expect(report.decision).toBe('accept')
    expect(report.total).toBeGreaterThanOrEqual(65)
  })

  it('accepts strong ecosystem-only collaborator (little personal craft)', () => {
    const report = scoreProfile(
      base({
        technicalReposOwned: 1,
        publicReposOwned: 2,
        totalAdditions: 5_000,
        structureMean: 0.4,
        totalStarsOnOwned: 0,
        externalMergedPrs: 25,
        orgPushEvents: 40,
        collabReposCount: 20,
        publicOrgCount: 3,
        aiAffinity: 0.4,
      }),
      { acceptThreshold: 65 },
    )
    expect(report.path).toBe('ecosystem')
    expect(report.decision).toBe('accept')
  })

  it('rejects AI keyword tourist with no craft and no ecosystem', () => {
    const report = scoreProfile(
      base({
        technicalReposOwned: 0,
        publicReposOwned: 3,
        totalAdditions: 500,
        structureMean: 0.9, // fake scaffolds
        totalStarsOnOwned: 0,
        daysSinceLastPush: 3,
        publicEvents90d: 50,
        activeMonths12: 6,
        aiAffinity: 1,
        externalMergedPrs: 0,
        orgPushEvents: 0,
        collabReposCount: 0,
        publicOrgCount: 0,
      }),
      { acceptThreshold: 65 },
    )
    expect(report.decision).toBe('reject')
    expect(report.hardFail?.reason).toMatch(/specialty_below_floor/)
  })

  it('rejects inactive profiles', () => {
    const report = scoreProfile(
      base({
        technicalReposOwned: 1,
        publicReposOwned: 2,
        totalAdditions: 200,
        totalStarsOnOwned: 0,
        daysSinceLastPush: 500,
        publicEvents90d: 0,
        activeMonths12: 0,
        structureMean: 0.1,
        aiAffinity: 0,
        externalMergedPrs: 0,
        publicOrgCount: 0,
        collabReposCount: 0,
        orgPushEvents: 0,
      }),
      { acceptThreshold: 65 },
    )
    expect(report.decision).toBe('reject')
  })

  it('is deterministic', () => {
    const s = base()
    expect(scoreProfile(s)).toEqual(scoreProfile(s))
  })

  it('adds hidden +10 entry PR bonus capped at 100', () => {
    const without = scoreProfile(base({ entryPrBonus: false }))
    const withBonus = scoreProfile(base({ entryPrBonus: true }))
    expect(withBonus.total).toBe(Math.min(100, without.total + 10))
    expect(withBonus.evidence.entryPrBonusPoints).toBe(10)
  })
})


describe('keywordAffinity', () => {
  it('scores AI-heavy text high', () => {
    const a = keywordAffinity(
      ['mcp agent harness for llm chatbots', 'rag pipeline'],
      ['ai', 'mcp'],
    )
    expect(a).toBeGreaterThan(0.5)
  })

  it('does not match ai inside email', () => {
    const a = keywordAffinity(['user@email.com contact form'])
    expect(a).toBe(0)
  })
})
