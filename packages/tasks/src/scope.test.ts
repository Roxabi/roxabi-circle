import { describe, expect, it } from 'vitest'
import { filterByScope, hasScope, matchesScopeFilter, normalizeScope } from './scope'

describe('scope', () => {
  it('hasScope', () => {
    expect(hasScope({ scopeKind: 'project', scopeId: 'p1' })).toBe(true)
    expect(hasScope({ scopeKind: null, scopeId: null })).toBe(false)
    expect(hasScope({})).toBe(false)
  })

  it('filter undefined = all', () => {
    const rows = [
      { id: 1, scopeKind: 'project', scopeId: 'a' },
      { id: 2, scopeKind: null, scopeId: null },
    ]
    expect(filterByScope(rows, undefined)).toHaveLength(2)
  })

  it('filter null = org-global only', () => {
    const rows = [{ id: 1, scopeKind: 'project', scopeId: 'a' }, { id: 2 }]
    expect(filterByScope(rows, null).map((r) => r.id)).toEqual([2])
  })

  it('filter ref matches', () => {
    const rows = [
      { id: 1, scopeKind: 'project', scopeId: 'a' },
      { id: 2, scopeKind: 'project', scopeId: 'b' },
    ]
    expect(filterByScope(rows, { scopeKind: 'project', scopeId: 'a' }).map((r) => r.id)).toEqual([
      1,
    ])
  })

  it('normalizeScope throws on half pair', () => {
    expect(() => normalizeScope('project', null)).toThrow()
  })

  it('matchesScopeFilter', () => {
    expect(matchesScopeFilter({ scopeKind: 'client', scopeId: 'c1' }, undefined)).toBe(true)
  })
})
