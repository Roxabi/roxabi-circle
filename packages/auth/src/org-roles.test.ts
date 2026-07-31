import { describe, expect, it } from 'vitest'
import {
  canInviteRole,
  isOrgRoleKey,
  normalizeEmail,
  roleAtLeast,
  roleHasCapability,
} from './org-roles'

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

  it('canInviteRole enforces ceiling', () => {
    expect(canInviteRole('owner', 'admin')).toBe(true)
    expect(canInviteRole('owner', 'member')).toBe(true)
    expect(canInviteRole('owner', 'reader')).toBe(true)
    expect(canInviteRole('owner', 'owner')).toBe(false)
    expect(canInviteRole('admin', 'member')).toBe(true)
    expect(canInviteRole('admin', 'reader')).toBe(true)
    expect(canInviteRole('admin', 'admin')).toBe(false)
    expect(canInviteRole('member', 'reader')).toBe(false)
    expect(canInviteRole('reader', 'member')).toBe(false)
  })

  it('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com')
  })
})
