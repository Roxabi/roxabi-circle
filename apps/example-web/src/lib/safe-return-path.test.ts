import { describe, expect, it } from 'vitest'
import { safeInviteReturnPath, safeMcpOAuthResumePath, safePostAuthPath } from './safe-return-path'

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

  it('strips query on /app (open-redirect bait in search)', () => {
    // pathname-only allowlist — // in query must not open a host redirect
    expect(safePostAuthPath('/app?x=//evil')).toBe('/app')
    expect(safePostAuthPath('/app?next=https://evil.com')).toBe('/app')
  })

  it('rejects open redirects and path traversal', () => {
    expect(safePostAuthPath('//evil.com')).toBeNull()
    expect(safePostAuthPath('https://evil.com')).toBeNull()
    expect(safePostAuthPath('/app/../admin')).toBeNull()
    expect(safePostAuthPath('/admin/..%2f..%2f')).toBeNull()
    expect(safePostAuthPath('/app/%2e%2e/admin')).toBeNull()
    expect(safePostAuthPath('/app/%2e%2e')).toBeNull()
    expect(safePostAuthPath('/app/foo%2f%2e%2e%2fadmin')).toBeNull()
    expect(safePostAuthPath('/reset-password')).toBeNull()
    expect(safePostAuthPath('/api/me')).toBeNull()
  })

  it('rejects empty / non-string (parity with invite suite)', () => {
    expect(safePostAuthPath('')).toBeNull()
    expect(safePostAuthPath('   ')).toBeNull()
    expect(safePostAuthPath(undefined)).toBeNull()
    expect(safePostAuthPath(null)).toBeNull()
    expect(safePostAuthPath(42)).toBeNull()
  })

  it('rejects double-encoded traversal', () => {
    expect(safePostAuthPath('/app/%252e%252e/admin')).toBeNull()
    expect(safePostAuthPath('/app/%25252e%25252e/x')).toBeNull()
  })
})

describe('safeMcpOAuthResumePath', () => {
  const authorize = 'http://127.0.0.1:8788/authorize?client_id=c1&state=s1'

  it('allows loopback authorize in r', () => {
    const next = `/mcp-oauth/resume?r=${encodeURIComponent(authorize)}`
    expect(safeMcpOAuthResumePath(next)).toBe(next)
    expect(safePostAuthPath(next)).toBe(next)
  })

  it('rejects missing r, open redirects, and non-authorize paths', () => {
    expect(safeMcpOAuthResumePath('/mcp-oauth/resume')).toBeNull()
    expect(safeMcpOAuthResumePath('/mcp-oauth/resume?r=https://evil.example/authorize')).toBeNull()
    expect(safeMcpOAuthResumePath('/mcp-oauth/resume?r=http://127.0.0.1:8788/mcp')).toBeNull()
    expect(safePostAuthPath('/mcp-oauth/resume?r=https://evil.example/authorize')).toBeNull()
  })
})
