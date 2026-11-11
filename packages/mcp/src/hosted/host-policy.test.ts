import { isReservedPath } from '@kit/mcp/hosted'
import { describe, expect, it } from 'vitest'
import {
  allowDynamicClientRegistration,
  grantedScope,
  isUrlClientId,
  MCP_SCOPE,
  shouldAutoApproveConsent,
} from './host-policy'
import { normalizeIdentity } from './identity-props'

const ALLOW = 'demo@kit.local'

describe('hosted host policy', () => {
  const loopback = new URL('http://127.0.0.1:8788/authorize')
  const prodHost = new URL('https://mcp.example.com/authorize')

  it('allows DCR only off production-shaped hosts', () => {
    expect(allowDynamicClientRegistration({}, loopback)).toBe(true)
    expect(allowDynamicClientRegistration({ ENVIRONMENT: 'test' }, loopback)).toBe(true)
    expect(allowDynamicClientRegistration({ ENVIRONMENT: 'production' }, loopback)).toBe(false)
    expect(allowDynamicClientRegistration({ ENVIRONMENT: 'staging' }, loopback)).toBe(false)
    expect(allowDynamicClientRegistration({}, prodHost)).toBe(false)
  })

  it('auto-approves only the caller email on loopback', () => {
    expect(
      shouldAutoApproveConsent({ env: {}, requestUrl: loopback, email: ALLOW, allowEmail: ALLOW }),
    ).toBe(true)
    expect(
      shouldAutoApproveConsent({
        env: {},
        requestUrl: loopback,
        email: 'demo-b@kit.local',
        allowEmail: ALLOW,
      }),
    ).toBe(false)
    expect(
      shouldAutoApproveConsent({
        env: { ENVIRONMENT: 'production' },
        requestUrl: loopback,
        email: ALLOW,
        allowEmail: ALLOW,
      }),
    ).toBe(false)
    expect(
      shouldAutoApproveConsent({ env: {}, requestUrl: prodHost, email: ALLOW, allowEmail: ALLOW }),
    ).toBe(false)
    expect(
      shouldAutoApproveConsent({ env: {}, requestUrl: loopback, email: ALLOW, allowEmail: '  ' }),
    ).toBe(false)
  })

  it('refuses a requested scope other than mcp', () => {
    expect(grantedScope([])).toEqual([])
    expect(grantedScope([MCP_SCOPE])).toEqual([MCP_SCOPE])
    expect(grantedScope(['admin'])).toBeNull()
    expect(grantedScope([MCP_SCOPE, 'admin'])).toBeNull()
  })

  it('identity keeps only userId and email, and refuses ids that collide in grant keys', () => {
    expect(normalizeIdentity(null)).toBeNull()
    expect(normalizeIdentity({ email: 'a@b.c' })).toBeNull()
    expect(normalizeIdentity({ userId: '  ' })).toBeNull()
    expect(normalizeIdentity({ userId: 'a:b' })).toBeNull()
    expect(
      normalizeIdentity({ userId: ' user ', email: ' a@b.c ', organization: 'org', grants: ['w'] }),
    ).toEqual({ userId: 'user', email: 'a@b.c' })
    expect(normalizeIdentity({ userId: 'user', email: '  ' })).toEqual({ userId: 'user' })
  })

  it('treats a URL client_id as self-declared and a provider id as registered', () => {
    expect(isUrlClientId('https://client.example/meta.json')).toBe(true)
    expect(isUrlClientId('https://client.example')).toBe(true)
    expect(isUrlClientId('http://127.0.0.1:9999/meta')).toBe(true)
    expect(isUrlClientId('Zk3pQ9xR2mT8')).toBe(false)
    expect(isUrlClientId('urn:client:1')).toBe(false)
  })

  it('reserves the shell paths in their decoded, slashed and prefixed forms', () => {
    for (const path of ['/mcp', '/mcp-admin', '/%6Dcp', '/authorize/', '//token', '/register']) {
      expect(isReservedPath(path), path).toBe(true)
    }
    expect(isReservedPath('/.well-known/oauth-authorization-server')).toBe(true)
    expect(isReservedPath('/%E0%A4%A')).toBe(true)
    for (const path of ['/', '/health', '/api/mcp', '/authorized', '/.well-known/security.txt']) {
      expect(isReservedPath(path), path).toBe(false)
    }
  })
})
