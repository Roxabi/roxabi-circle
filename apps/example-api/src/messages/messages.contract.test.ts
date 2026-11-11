import { describe, expect, it } from 'vitest'
import { en } from './en'
import { fr } from './fr'
import { notificationLocale } from './index'

describe('notification message catalogs', () => {
  it('have the same non-empty keys and safe string values', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort())
    for (const value of [...Object.values(fr), ...Object.values(en)]) {
      expect(value.trim()).not.toBe('')
      expect(value).not.toMatch(/^\s*(TODO|FIXME|XXX)\s*$/i)
      expect(value).not.toMatch(/<\s*script|javascript:|onerror\s*=/i)
    }
  })
  it('resolves only exact supported locales', () => {
    expect(notificationLocale('en')).toBe('en')
    for (const value of [undefined, 'en-US', 'en,fr', 'en;q=1', 'FR']) {
      expect(notificationLocale(value)).toBe('fr')
    }
  })
})
