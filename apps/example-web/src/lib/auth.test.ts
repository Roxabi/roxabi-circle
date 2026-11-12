import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '../test/query-client'
import { ApiError, HttpError } from './api'
import {
  canManageMembers,
  defaultHomePath,
  ensureMe,
  fetchMe,
  hasPlatformRole,
  isClientOnly,
  isPlatformActor,
  isUnauthorized,
  type MeResponse,
  meOrgSchema,
  meQueryKey,
  meResponseSchema,
  postAuthTarget,
  writeMeCache,
} from './auth'

function me(partial: Partial<MeResponse>): MeResponse {
  return {
    subject: 'user_x',
    authMethod: 'session',
    platformRole: null,
    impersonation: null,
    impersonationPermissions: { read: false, write: false },
    orgs: [],
    requestId: 'req_test',
    ...partial,
  }
}

describe('auth helpers (S1 shells)', () => {
  it('hasPlatformRole matches staff/super_admin', () => {
    expect(hasPlatformRole(me({ platformRole: 'staff' }), 'staff')).toBe(true)
    expect(hasPlatformRole(me({ platformRole: 'super_admin' }), 'staff', 'super_admin')).toBe(true)
    expect(hasPlatformRole(me({ platformRole: null }), 'staff')).toBe(false)
    expect(hasPlatformRole(undefined, 'staff')).toBe(false)
  })

  it('isPlatformActor / isClientOnly / defaultHomePath persona matrix', () => {
    const staff = me({ subject: 'user_staff', platformRole: 'staff' })
    const solo = me({
      subject: 'user_solo',
      platformRole: null,
      orgs: [
        {
          id: 'org_solo',
          name: 'Solo',
          slug: 'solo',
          kind: 'client',
          status: 'active',
          role: 'owner',
        },
      ],
    })
    const demo = me({ subject: 'user_demo', platformRole: null })

    expect(isPlatformActor(staff)).toBe(true)
    expect(isClientOnly(staff)).toBe(false)
    expect(defaultHomePath(staff)).toBe('/admin')

    expect(isPlatformActor(solo)).toBe(false)
    expect(isClientOnly(solo)).toBe(true)
    expect(defaultHomePath(solo)).toBe('/app')

    // no platformRole → client home, never BO
    expect(isPlatformActor(demo)).toBe(false)
    expect(defaultHomePath(demo)).toBe('/app')
  })

  it('isUnauthorized detects HTTP 401, including non-kit responses', () => {
    expect(
      isUnauthorized(
        new ApiError(401, { error: { code: 'UNAUTHORIZED', message: 'no' }, requestId: 'r' }),
      ),
    ).toBe(true)
    expect(
      isUnauthorized(
        new ApiError(403, { error: { code: 'FORBIDDEN', message: 'no' }, requestId: 'r' }),
      ),
    ).toBe(false)
    expect(isUnauthorized(new HttpError(401))).toBe(true)
    expect(isUnauthorized(new HttpError(403))).toBe(false)
    expect(isUnauthorized(new Error('HTTP 401'))).toBe(false)
    expect(isUnauthorized(new Error('x'))).toBe(false)
    expect(isUnauthorized(undefined)).toBe(false)
  })

  it('canManageMembers is owner/admin only', () => {
    const base = me({
      orgs: [
        {
          id: 'org_team',
          name: 'Team',
          slug: 'team',
          kind: 'client',
          status: 'active',
          role: 'owner',
        },
        {
          id: 'org_read',
          name: 'Read',
          slug: 'read',
          kind: 'client',
          status: 'active',
          role: 'reader',
        },
      ],
    })
    expect(canManageMembers(base, 'org_team')).toBe(true)
    expect(
      canManageMembers({ ...base, orgs: [{ ...base.orgs[0]!, role: 'admin' }] }, 'org_team'),
    ).toBe(true)
    expect(canManageMembers(base, 'org_read')).toBe(false)
    expect(canManageMembers(base, 'missing')).toBe(false)
    expect(canManageMembers(undefined, 'org_team')).toBe(false)
  })

  it('postAuthTarget prefers allowlisted invite next, else default home', () => {
    const client = me({ platformRole: null })
    expect(postAuthTarget(client, undefined)).toBe('/app')
    expect(postAuthTarget(client, '/invite/accept?invitationId=inv_1')).toBe(
      '/invite/accept?invitationId=inv_1',
    )
    expect(postAuthTarget(client, 'https://evil.test/invite/accept')).toBe('/app')
    expect(postAuthTarget(me({ platformRole: 'staff' }), undefined)).toBe('/admin')
    const resume = `/mcp-oauth/resume?r=${encodeURIComponent('http://127.0.0.1:8788/authorize?client_id=c1')}`
    expect(postAuthTarget(client, resume)).toBe(resume)
    expect(postAuthTarget(client, '/mcp-oauth/resume?r=https://evil.example/authorize')).toBe(
      '/app',
    )
  })

  it('meResponseSchema fails closed on gate-critical shape drift', () => {
    const ok = meResponseSchema.parse({
      subject: 'user_1',
      platformRole: 'staff',
      impersonation: null,
      impersonationPermissions: { read: false, write: false },
      orgs: [
        {
          id: 'org_1',
          name: 'Acme',
          slug: 'acme',
          kind: 'client',
          status: 'active',
          role: 'owner',
        },
      ],
      requestId: 'req_1',
    })
    expect(ok.platformRole).toBe('staff')
    expect(() => meResponseSchema.parse({ ...ok, impersonation: undefined })).toThrow()
    expect(() => meResponseSchema.parse({ ...ok, impersonationPermissions: undefined })).toThrow()
    expect(() =>
      meResponseSchema.parse({ ...ok, impersonationPermissions: { read: false } }),
    ).toThrow()
    expect(() =>
      meResponseSchema.parse({
        subject: 'user_1',
        impersonation: null,
        impersonationPermissions: { read: false, write: false },
        orgs: [],
        requestId: 'req_1',
      }),
    ).toThrow()
    expect(() =>
      meResponseSchema.parse({
        subject: 'user_1',
        platformRole: 'owner',
        impersonation: null,
        impersonationPermissions: { read: false, write: false },
        orgs: [],
        requestId: 'req_1',
      }),
    ).toThrow()
    expect(
      meResponseSchema.parse({
        subject: 'user_1',
        platformRole: 'staff',
        impersonation: null,
        impersonationPermissions: { read: false, write: false },
        orgs: [
          {
            id: 'org_1',
            name: 'Acme',
            slug: 'acme',
            kind: 'partner',
            status: 'pending',
            role: 'owner',
          },
        ],
        requestId: 'req_1',
      }).orgs[0]?.kind,
    ).toBe('partner')
  })

  it('fetchMe fails closed on drifted /api/me JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            subject: 'user_1',
            platformRole: 'owner',
            impersonation: null,
            impersonationPermissions: { read: false, write: false },
            orgs: [],
            requestId: 'req_1',
          }),
      }),
    )
    await expect(fetchMe()).rejects.toThrow(/Invalid API response/)
  })

  it('meResponseSchema accepts a Worker seed-shaped staff payload', () => {
    const parsed = meResponseSchema.parse({
      subject: 'user_staff',
      email: 'staff@kit.local',
      name: 'Staff Agent',
      authMethod: 'session',
      platformRole: 'staff',
      impersonation: null,
      impersonationPermissions: { read: false, write: false },
      orgs: [
        {
          id: 'org_acme',
          name: 'Acme Client',
          slug: 'acme',
          kind: 'client',
          status: 'active',
          role: 'admin',
        },
        {
          id: 'org_beta',
          name: 'Beta Client',
          slug: 'beta',
          kind: 'client',
          status: 'active',
          role: 'member',
        },
      ],
      requestId: 'req_contract',
    })
    expect(parsed.orgs.map((o) => o.id).sort()).toEqual(['org_acme', 'org_beta'])
  })

  it('ensureMe returns parsed cache without refetch', async () => {
    const qc = createTestQueryClient()
    qc.setQueryData(
      meQueryKey,
      me({ subject: 'user_1', platformRole: null, orgs: [], requestId: 'req_1' }),
    )
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const cached = await ensureMe(qc)
    expect(cached.subject).toBe('user_1')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ensureMe drops a poisoned me cache and refetches through fetchMe', async () => {
    const qc = createTestQueryClient()
    qc.setQueryData(meQueryKey, {
      subject: 'user_1',
      platformRole: 'owner',
      impersonation: null,
      impersonationPermissions: { read: false, write: false },
      orgs: [],
      requestId: 'req_bad',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            subject: 'user_1',
            platformRole: 'staff',
            impersonation: null,
            impersonationPermissions: { read: false, write: false },
            orgs: [],
            requestId: 'req_1',
          }),
      }),
    )
    const recovered = await ensureMe(qc)
    expect(recovered.platformRole).toBe('staff')
  })

  it('writeMeCache rejects a patch that breaks meResponseSchema', () => {
    const qc = createTestQueryClient()
    const ok = me({ subject: 'user_1', platformRole: null, orgs: [], requestId: 'req_1' })
    qc.setQueryData(meQueryKey, ok)
    expect(() =>
      writeMeCache(qc, () => ({
        subject: 'user_1',
        platformRole: 'owner',
        impersonation: null,
        impersonationPermissions: { read: false, write: false },
        orgs: [],
        requestId: 'req_1',
      })),
    ).toThrow()
    expect(qc.getQueryData(meQueryKey)).toEqual(ok)
  })

  it('optimistic org membership must satisfy meOrgSchema', () => {
    expect(
      meOrgSchema.parse({
        id: 'org_new',
        name: 'Acme',
        slug: 'acme',
        kind: 'client',
        status: 'active',
        role: 'owner',
      }).id,
    ).toBe('org_new')
    expect(() =>
      meOrgSchema.parse({
        id: '',
        name: 'Acme',
        slug: 'acme',
        kind: 'client',
        status: 'active',
        role: 'owner',
      }),
    ).toThrow()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})
