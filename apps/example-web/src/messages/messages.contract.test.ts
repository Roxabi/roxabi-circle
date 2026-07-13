/**
 * i18n value contract (not security).
 * Key parity is enforced by TypeScript (`en: Messages` from fr).
 * This test catches empty / placeholder-only copy.
 */
import { describe, expect, it } from 'vitest'
import { en } from './en'
import { fr, type Messages } from './fr'

const HTMLISH = /<\s*script|javascript:|onerror\s*=/i
const TODOISH = /^\s*(TODO|FIXME|XXX)\s*$/i

function assertCatalog(name: string, catalog: Messages) {
  const keys = Object.keys(catalog) as (keyof Messages)[]
  expect(keys.length).toBeGreaterThan(0)
  for (const key of keys) {
    const value = catalog[key]
    expect(value, `${name}.${key} must be a string`).toBeTypeOf('string')
    expect(value.trim().length, `${name}.${key} must be non-empty`).toBeGreaterThan(0)
    expect(TODOISH.test(value), `${name}.${key} must not be a TODO placeholder`).toBe(false)
    expect(HTMLISH.test(value), `${name}.${key} must not contain raw script/HTML handlers`).toBe(
      false,
    )
  }
}

describe('messages contract', () => {
  it('fr and en have non-empty safe string values', () => {
    assertCatalog('fr', fr)
    assertCatalog('en', en)
  })

  it('fr and en expose the same key set (belt; typecheck is primary)', () => {
    const frKeys = Object.keys(fr).sort()
    const enKeys = Object.keys(en).sort()
    expect(enKeys).toEqual(frKeys)
  })

  it('never ships demo password literals in production message catalogs', () => {
    const blob = `${JSON.stringify(fr)}\n${JSON.stringify(en)}`
    expect(blob).not.toMatch(/demo-password/i)
    expect(blob).not.toMatch(/password-change-me/i)
  })
})
