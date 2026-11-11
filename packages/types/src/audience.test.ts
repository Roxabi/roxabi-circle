import { describe, expect, it } from 'vitest'
import { canSetVisibility, canViewByAudience, filterForAudience, isAudience } from './audience'

describe('isAudience', () => {
  it('accepts staff and external only', () => {
    expect(isAudience('staff')).toBe(true)
    expect(isAudience('external')).toBe(true)
    expect(isAudience('admin')).toBe(false)
    expect(isAudience(null)).toBe(false)
  })
})

describe('canViewByAudience', () => {
  it('staff sees internal and shared', () => {
    expect(canViewByAudience({ visibility: 'internal' }, 'staff')).toBe(true)
    expect(canViewByAudience({ visibility: 'shared' }, 'staff')).toBe(true)
  })

  it('external sees shared only', () => {
    expect(canViewByAudience({ visibility: 'shared' }, 'external')).toBe(true)
    expect(canViewByAudience({ visibility: 'internal' }, 'external')).toBe(false)
  })
})

describe('filterForAudience', () => {
  const rows = [
    { id: '1', visibility: 'internal' as const },
    { id: '2', visibility: 'shared' as const },
  ]

  it('staff keeps all', () => {
    expect(filterForAudience(rows, 'staff')).toHaveLength(2)
  })

  it('external drops internal', () => {
    expect(filterForAudience(rows, 'external').map((row) => row.id)).toEqual(['2'])
  })
})

describe('canSetVisibility', () => {
  it('external cannot set internal', () => {
    expect(canSetVisibility('external', 'internal')).toBe(false)
    expect(canSetVisibility('external', 'shared')).toBe(true)
  })

  it('staff can set both', () => {
    expect(canSetVisibility('staff', 'internal')).toBe(true)
    expect(canSetVisibility('staff', 'shared')).toBe(true)
  })
})
