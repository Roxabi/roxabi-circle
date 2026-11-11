import {
  canViewByAudience,
  filterForAudience,
  canSetVisibility as sharedCanSetVisibility,
} from '@kit/types'
import { describe, expect, it } from 'vitest'
import { canSetVisibility, canViewTask, filterTasksForAudience } from './visibility'

describe('shared object ACL', () => {
  it('re-exports the @kit/types helpers (no local fork)', () => {
    expect(typeof canViewByAudience).toBe('function')
    expect(typeof filterForAudience).toBe('function')
    expect(typeof sharedCanSetVisibility).toBe('function')
    expect(canViewTask).toBe(canViewByAudience)
    expect(filterTasksForAudience).toBe(filterForAudience)
    expect(canSetVisibility).toBe(sharedCanSetVisibility)
  })
})

describe('canViewTask', () => {
  it('staff sees internal and shared', () => {
    expect(canViewTask({ visibility: 'internal' }, 'staff')).toBe(true)
    expect(canViewTask({ visibility: 'shared' }, 'staff')).toBe(true)
  })

  it('external sees shared only', () => {
    expect(canViewTask({ visibility: 'shared' }, 'external')).toBe(true)
    expect(canViewTask({ visibility: 'internal' }, 'external')).toBe(false)
  })
})

describe('filterTasksForAudience', () => {
  const rows = [
    { id: '1', visibility: 'internal' as const },
    { id: '2', visibility: 'shared' as const },
  ]

  it('staff keeps all', () => {
    expect(filterTasksForAudience(rows, 'staff')).toHaveLength(2)
  })

  it('external drops internal', () => {
    expect(filterTasksForAudience(rows, 'external').map((r) => r.id)).toEqual(['2'])
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
