import type { MeOrg, MeResponse } from '../lib/auth'

export function createMeOrg(overrides: Partial<MeOrg> = {}): MeOrg {
  return {
    id: 'org_test',
    name: 'Test org',
    slug: 'test-org',
    kind: 'client',
    status: 'active',
    role: 'member',
    ...overrides,
  }
}

export function createMe(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    subject: 'user_test',
    email: 'test@kit.local',
    authMethod: 'session',
    platformRole: null,
    impersonation: null,
    impersonationPermissions: { read: false, write: false },
    requestId: 'test-request',
    orgs: [],
    ...overrides,
  }
}
