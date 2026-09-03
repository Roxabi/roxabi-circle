import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import {
  canManageMembers,
  defaultHomePath,
  hasPlatformRole,
  isClientOnly,
  isPlatformActor,
  isUnauthorized,
  type MeResponse,
  postAuthTarget,
} from './auth'

function me(partial: Partial<MeResponse>): MeResponse {
  return {
    subject: 'user_x',
    authMethod: 'session',
    role: 'user',
    platformRole: null,
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
    const staff = me({ subject: 'user_staff', platformRole: 'staff', role: 'user' })
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
    const demo = me({ subject: 'user_demo', role: 'admin', platformRole: null })

    expect(isPlatformActor(staff)).toBe(true)
    expect(isClientOnly(staff)).toBe(false)
    expect(defaultHomePath(staff)).toBe('/admin')

    expect(isPlatformActor(solo)).toBe(false)
    expect(isClientOnly(solo)).toBe(true)
    expect(defaultHomePath(solo)).toBe('/app')

    // KitRole admin alone does not open BO
    expect(isPlatformActor(demo)).toBe(false)
    expect(defaultHomePath(demo)).toBe('/app')
  })

  it('isUnauthorized detects ApiError 401 only', () => {
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
  })
})
