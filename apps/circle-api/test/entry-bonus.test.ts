import { describe, expect, it } from 'vitest'
import {
  ENTRY_PR_BONUS_POINTS,
  normalizePrBody,
  prBodyGrantsEntryBonus,
} from '../src/scoring/entry-bonus'

describe('entry PR bonus body match', () => {
  it('exports +10 points constant', () => {
    expect(ENTRY_PR_BONUS_POINTS).toBe(10)
  })

  it('rejects empty / multi-line / noise', async () => {
    expect(await prBodyGrantsEntryBonus('')).toBe(false)
    expect(await prBodyGrantsEntryBonus(null)).toBe(false)
    expect(await prBodyGrantsEntryBonus('hello')).toBe(false)
    expect(await prBodyGrantsEntryBonus('line1\nline2')).toBe(false)
  })

  it('accepts one exact art line (leading spaces matter)', async () => {
    const line = '                          oooo$$$$$$$$$$$$oooo'
    expect(await prBodyGrantsEntryBonus(line)).toBe(true)
    expect(await prBodyGrantsEntryBonus(`${line}\n`)).toBe(true)
    // truncated / trimmed → no
    expect(await prBodyGrantsEntryBonus(line.trim())).toBe(false)
  })

  it('accepts marker line alone', async () => {
    expect(await prBodyGrantsEntryBonus('.oO CIRCLE-EGG-v1 Oo.')).toBe(true)
  })

  it('normalizePrBody strips trailing newlines only', () => {
    expect(normalizePrBody('  ab  \n\n')).toBe('  ab')
    expect(normalizePrBody('a\nb')).toBe('a\nb')
  })
})
