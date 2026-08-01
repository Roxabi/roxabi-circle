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
    ...over,
  }
}

describe('scoreProfile', () => {
  it('accepts a strong OSS + AI profile', () => {
    const report = scoreProfile(base(), { acceptThreshold: 65 })
    expect(report.hardFail).toBeUndefined()
    expect(report.total).toBeGreaterThanOrEqual(65)
    expect(report.decision).toBe('accept')
  })

  it('rejects inactive tutorial-like profiles', () => {
    const report = scoreProfile(
      base({
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
      }),
      { acceptThreshold: 65 },
    )
    expect(report.decision).toBe('reject')
    expect(report.total).toBeLessThan(40)
  })

  it('is deterministic', () => {
    const s = base()
    expect(scoreProfile(s)).toEqual(scoreProfile(s))
  })
})

describe('keywordAffinity', () => {
  it('scores AI-heavy text high', () => {
    const a = keywordAffinity(['mcp agent harness for llm chatbots', 'rag pipeline'], ['ai', 'mcp'])
    expect(a).toBeGreaterThan(0.5)
  })

  it('does not match ai inside email', () => {
    const a = keywordAffinity(['user@email.com contact form'])
    expect(a).toBe(0)
  })
})
