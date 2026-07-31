import { describe, expect, it } from 'vitest'
import {
  defaultHomePath,
  hasPlatformRole,
  isClientOnly,
  isPlatformActor,
  type MeResponse,
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
})
