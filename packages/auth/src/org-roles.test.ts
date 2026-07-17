import { describe, expect, it } from 'vitest'
import { isOrgRoleKey, roleAtLeast, roleHasCapability } from './org-roles'

describe('org-roles', () => {
  it('allowlists system roles', () => {
    expect(isOrgRoleKey('owner')).toBe(true)
    expect(isOrgRoleKey('reader')).toBe(true)
    expect(isOrgRoleKey('super_admin')).toBe(false)
  })

  it('orders roles for roleAtLeast', () => {
    expect(roleAtLeast('owner', 'admin')).toBe(true)
    expect(roleAtLeast('member', 'admin')).toBe(false)
    expect(roleAtLeast('reader', 'reader')).toBe(true)
  })

  it('maps capabilities', () => {
    expect(roleHasCapability('reader', 'read')).toBe(true)
    expect(roleHasCapability('reader', 'write')).toBe(false)
    expect(roleHasCapability('admin', 'manage_modules')).toBe(true)
    expect(roleHasCapability('member', 'manage_members')).toBe(false)
    expect(roleHasCapability('owner', 'delete_org')).toBe(true)
  })
})
