import { describe, expect, it } from 'vitest'
import { createI18n } from './index'

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
    // unknown locale falls back to default
    expect(i18n.t('de' as L).hello).toBe('bonjour')
  })
})
