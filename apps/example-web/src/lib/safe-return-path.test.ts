import { describe, expect, it } from 'vitest'
import { safeInviteReturnPath, safePostAuthPath } from './safe-return-path'

describe('safeInviteReturnPath', () => {
  it('allows invite accept with invitationId query', () => {
    expect(safeInviteReturnPath('/invite/accept?invitationId=abc')).toBe(
      '/invite/accept?invitationId=abc',
    )
  })

  it('allows bare invite accept path', () => {
    expect(safeInviteReturnPath('/invite/accept')).toBe('/invite/accept')
  })

  it('rejects open redirects and non-invite paths', () => {
    expect(safeInviteReturnPath('//evil.com')).toBeNull()
    expect(safeInviteReturnPath('https://evil.com')).toBeNull()
    expect(safeInviteReturnPath('http://evil.com/invite/accept')).toBeNull()
    expect(safeInviteReturnPath('/app')).toBeNull()
    expect(safeInviteReturnPath('/admin')).toBeNull()
    expect(safeInviteReturnPath('/invite/accept/../admin')).toBeNull()
    expect(safeInviteReturnPath('/invite/accept%2f..%2fadmin')).toBeNull()
  })

  it('rejects empty / non-string', () => {
    expect(safeInviteReturnPath('')).toBeNull()
    expect(safeInviteReturnPath('   ')).toBeNull()
    expect(safeInviteReturnPath(undefined)).toBeNull()
    expect(safeInviteReturnPath(null)).toBeNull()
    expect(safeInviteReturnPath(42)).toBeNull()
  })
})

describe('safePostAuthPath', () => {
  it('allows /app, /admin, nested paths, /login, invite accept', () => {
    expect(safePostAuthPath('/app')).toBe('/app')
    expect(safePostAuthPath('/app/orgs/x')).toBe('/app/orgs/x')
    expect(safePostAuthPath('/admin')).toBe('/admin')
    expect(safePostAuthPath('/admin/users')).toBe('/admin/users')
    expect(safePostAuthPath('/login')).toBe('/login')
    expect(safePostAuthPath('/invite/accept?invitationId=z')).toBe('/invite/accept?invitationId=z')
  })

  it('rejects open redirects and traversal', () => {
    expect(safePostAuthPath('//evil.com')).toBeNull()
    expect(safePostAuthPath('https://evil.com')).toBeNull()
    expect(safePostAuthPath('/app/../admin')).toBeNull()
    expect(safePostAuthPath('/reset-password')).toBeNull()
    expect(safePostAuthPath('/api/me')).toBeNull()
    expect(safePostAuthPath('')).toBeNull()
    expect(safePostAuthPath(null)).toBeNull()
  })
})
