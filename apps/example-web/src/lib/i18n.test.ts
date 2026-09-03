import { hasLocaleSwitcher } from '@kit/i18n'
import { describe, expect, it } from 'vitest'
import { defaultLocale, locales, t } from './i18n'

describe('i18n', () => {
  it('defaults to FR and registers FR+EN (kit dogfood of the switcher)', () => {
    expect(defaultLocale).toBe('fr')
    expect(locales).toEqual(['fr', 'en'])
    expect(hasLocaleSwitcher(locales)).toBe(true)
    expect(t('fr').login).toBe('Connexion')
    expect(t('en').login).toBe('Sign in')
  })
})
