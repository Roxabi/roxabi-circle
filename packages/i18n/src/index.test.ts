import { describe, expect, it } from 'vitest'
import { createI18n, hasLocaleSwitcher, isLocale, resolveLocale } from './index'

describe('createI18n', () => {
  it('resolves catalogs without embedding product strings in package', () => {
    type L = 'fr' | 'en'
    const i18n = createI18n<L, { hello: string }>({
      defaultLocale: 'fr',
      catalogs: {
        fr: { hello: 'bonjour' },
        en: { hello: 'hello' },
      },
    })
    expect(i18n.t('fr').hello).toBe('bonjour')
    expect(i18n.t('en').hello).toBe('hello')
    expect(i18n.locales).toEqual(['fr', 'en'])
    // unknown locale falls back to default
    expect(i18n.t('de' as L).hello).toBe('bonjour')
  })

  it('accepts a single catalog (product mono-locale)', () => {
    const i18n = createI18n<'fr', { hello: string }>({
      defaultLocale: 'fr',
      catalogs: { fr: { hello: 'bonjour' } },
    })
    expect(i18n.locales).toEqual(['fr'])
    expect(hasLocaleSwitcher(i18n.locales)).toBe(false)
    expect(i18n.t('fr').hello).toBe('bonjour')
  })

  it('rejects empty catalogs and a defaultLocale missing from catalogs', () => {
    expect(() =>
      createI18n({ defaultLocale: 'fr', catalogs: {} as Record<'fr', { hello: string }> }),
    ).toThrow(/at least one locale/)
    expect(() =>
      createI18n({
        defaultLocale: 'en' as 'fr',
        catalogs: { fr: { hello: 'bonjour' } },
      }),
    ).toThrow(/defaultLocale "en"/)
  })
})

describe('locale policy helpers', () => {
  const locales = ['fr', 'en'] as const

  it('isLocale / resolveLocale ignore stale stored values', () => {
    expect(isLocale(locales, 'en')).toBe(true)
    expect(isLocale(locales, 'de')).toBe(false)
    expect(isLocale(locales, null)).toBe(false)
    expect(resolveLocale(locales, 'fr', 'en')).toBe('en')
    expect(resolveLocale(locales, 'fr', 'de')).toBe('fr')
    expect(resolveLocale(['fr'] as const, 'fr', 'en')).toBe('fr')
  })

  it('hasLocaleSwitcher is true only when more than one catalog is registered', () => {
    expect(hasLocaleSwitcher(locales)).toBe(true)
    expect(hasLocaleSwitcher(['fr'] as const)).toBe(false)
    expect(hasLocaleSwitcher([] as const)).toBe(false)
  })
})
