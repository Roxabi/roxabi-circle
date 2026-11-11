import { describe, expect, it } from 'vitest'
import { orgRoleLabel } from './org-role'

const m = {
  roleOwner: 'Owner',
  roleAdmin: 'Admin',
  roleMember: 'Member',
  roleReader: 'Reader',
}

describe('orgRoleLabel', () => {
  it('maps system keys to catalog strings', () => {
    expect(orgRoleLabel('owner', m)).toBe('Owner')
    expect(orgRoleLabel('admin', m)).toBe('Admin')
    expect(orgRoleLabel('member', m)).toBe('Member')
    expect(orgRoleLabel('reader', m)).toBe('Reader')
  })

  it('returns raw key for unknown role without name map (not Member)', () => {
    expect(orgRoleLabel('lead', m)).toBe('lead')
    expect(orgRoleLabel('lead', m)).not.toBe('Member')
  })

  it('uses Map nameByKey for custom roles', () => {
    const map = new Map([['lead', 'Lead']])
    expect(orgRoleLabel('lead', m, map)).toBe('Lead')
  })

  it('uses Record nameByKey for custom roles', () => {
    expect(orgRoleLabel('lead', m, { lead: 'Lead' })).toBe('Lead')
  })

  it('falls back to raw key when map misses entry', () => {
    expect(orgRoleLabel('ghost', m, { lead: 'Lead' })).toBe('ghost')
  })
})
