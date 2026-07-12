import { describe, expect, it } from 'vitest'
import { defaultLocale, t } from './i18n'

describe('i18n', () => {
  it('defaults to FR', () => {
    expect(defaultLocale).toBe('fr')
    expect(t('fr').login).toBe('Connexion')
    expect(t('en').login).toBe('Sign in')
  })
})
