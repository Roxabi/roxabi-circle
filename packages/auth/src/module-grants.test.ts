import { describe, expect, it } from 'vitest'
import {
  accessAllows,
  grantsDominate,
  isAssignableRoleKey,
  isModuleAccess,
  systemRoleDefaultAccess,
  systemRoleGrantSeed,
} from './module-grants'

describe('module-grants (Phase B pure)', () => {
  it('accessAllows maps write/read/disabled', () => {
    expect(accessAllows('write', 'write')).toBe(true)
    expect(accessAllows('write', 'read')).toBe(true)
    expect(accessAllows('read', 'read')).toBe(true)
    expect(accessAllows('read', 'write')).toBe(false)
    expect(accessAllows('disabled', 'read')).toBe(false)
    expect(accessAllows(null, 'read')).toBe(false)
  })

  it('systemRoleDefaultAccess matches Phase A seed intent', () => {
    expect(systemRoleDefaultAccess('owner')).toBe('write')
    expect(systemRoleDefaultAccess('admin')).toBe('write')
    expect(systemRoleDefaultAccess('member')).toBe('write')
    expect(systemRoleDefaultAccess('reader')).toBe('read')
  })

  it('systemRoleGrantSeed covers all roles × modules', () => {
    const rows = systemRoleGrantSeed(['feedback', 'notes'])
    expect(rows).toHaveLength(8)
    expect(rows.find((r) => r.roleKey === 'reader' && r.moduleId === 'feedback')?.access).toBe(
      'read',
    )
  })

  it('grantsDominate enforces ceiling', () => {
    const actor = new Map([
      ['feedback', 'write' as const],
      ['notes', 'read' as const],
    ])
    const weaker = new Map([
      ['feedback', 'read' as const],
      ['notes', 'read' as const],
    ])
    const stronger = new Map([
      ['feedback', 'write' as const],
      ['notes', 'write' as const],
    ])
    expect(grantsDominate(actor, weaker, ['feedback', 'notes'])).toBe(true)
    expect(grantsDominate(actor, stronger, ['feedback', 'notes'])).toBe(false)
  })

  it('isAssignableRoleKey allows invitable system + custom, never owner', () => {
    expect(isAssignableRoleKey('owner', [])).toBe(false)
    expect(isAssignableRoleKey('admin', [])).toBe(true)
    expect(isAssignableRoleKey('member', [])).toBe(true)
    expect(isAssignableRoleKey('lead', ['lead'])).toBe(true)
    expect(isAssignableRoleKey('lead', [])).toBe(false)
    expect(isModuleAccess('write')).toBe(true)
    expect(isModuleAccess('nope')).toBe(false)
  })
})
