import { describe, expect, it } from 'vitest'
import type { Release } from '../content/releases'
import { getReleases, pickBullets, pickLocalized } from './releases'

const sample: Release[] = [
  {
    id: 'old',
    version: '0.0.1',
    date: '2026-01-01',
    title: { fr: 'Ancien', en: 'Old' },
    bullets: { fr: ['a'], en: ['a-en'] },
  },
  {
    id: 'new',
    version: '0.2.0',
    date: '2026-08-04',
    title: { fr: 'Récent', en: 'Recent' },
    bullets: { fr: ['b'], en: ['b-en'] },
  },
  {
    id: 'bad-date',
    version: '0.0.0',
    date: 'not-a-date',
    title: { fr: 'Invalide', en: 'Invalid' },
    bullets: { fr: [], en: [] },
  },
]

describe('getReleases', () => {
  it('sorts newest first and bad dates last', () => {
    const sorted = getReleases(sample)
    expect(sorted.map((r) => r.id)).toEqual(['new', 'old', 'bad-date'])
  })

  it('returns empty array without throw', () => {
    expect(getReleases([])).toEqual([])
  })

  it('exports dogfood releases with at least one entry', () => {
    const live = getReleases()
    expect(live.length).toBeGreaterThanOrEqual(1)
    expect(live[0]?.version).toBeTruthy()
    expect(live[0]?.bullets.fr.length + live[0]!.bullets.en.length).toBeGreaterThan(0)
  })
})

describe('pickLocalized / pickBullets', () => {
  const text = { fr: 'Bonjour', en: 'Hello' }

  it('picks en when locale is en', () => {
    expect(pickLocalized(text, 'en')).toBe('Hello')
  })

  it('falls back to fr for unknown locale', () => {
    expect(pickLocalized(text, 'de')).toBe('Bonjour')
  })

  it('falls back to en when fr empty', () => {
    expect(pickLocalized({ fr: '  ', en: 'Only EN' }, 'fr')).toBe('Only EN')
  })

  it('picks en bullets for en locale', () => {
    expect(pickBullets(sample[1]!, 'en')).toEqual(['b-en'])
  })

  it('falls back to fr bullets', () => {
    expect(pickBullets(sample[1]!, 'de')).toEqual(['b'])
  })
})
