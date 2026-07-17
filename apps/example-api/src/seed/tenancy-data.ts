/**
 * Multi-tenant demo personas (ADR-0003).
 * Used when seeding BA user + org + membership + platform roles.
 */

export type TenancyPersona = {
  id: string
  email: string
  password: string
  name: string
  platformRole?: 'super_admin' | 'staff'
}

export type TenancyOrg = {
  id: string
  name: string
  slug: string
  kind: 'client' | 'internal'
  members: { userId: string; role: 'owner' | 'admin' | 'member' | 'reader' }[]
}

export const TENANCY_PASSWORD = 'demo-password-change-me'

export const TENANCY_PERSONAS: readonly TenancyPersona[] = [
  {
    id: 'user_super',
    email: 'super@gosilex.local',
    password: TENANCY_PASSWORD,
    name: 'Super Admin',
    platformRole: 'super_admin',
  },
  {
    id: 'user_staff',
    email: 'staff@gosilex.local',
    password: TENANCY_PASSWORD,
    name: 'Staff Agent',
    platformRole: 'staff',
  },
  {
    id: 'user_solo',
    email: 'solo@gosilex.local',
    password: TENANCY_PASSWORD,
    name: 'Solo Client',
  },
  {
    id: 'user_team_owner',
    email: 'team-owner@gosilex.local',
    password: TENANCY_PASSWORD,
    name: 'Team Owner',
  },
  {
    id: 'user_team_reader',
    email: 'team-reader@gosilex.local',
    password: TENANCY_PASSWORD,
    name: 'Team Reader',
  },
] as const

export const TENANCY_ORGS: readonly TenancyOrg[] = [
  {
    id: 'org_acme',
    name: 'Acme Client',
    slug: 'acme',
    kind: 'client',
    members: [
      { userId: 'user_staff', role: 'admin' },
      { userId: 'user_team_owner', role: 'member' },
    ],
  },
  {
    id: 'org_beta',
    name: 'Beta Client',
    slug: 'beta',
    kind: 'client',
    members: [{ userId: 'user_staff', role: 'member' }],
  },
  {
    id: 'org_solo',
    name: 'Solo Space',
    slug: 'solo',
    kind: 'client',
    members: [{ userId: 'user_solo', role: 'owner' }],
  },
  {
    id: 'org_team',
    name: 'Team Client',
    slug: 'team',
    kind: 'client',
    members: [
      { userId: 'user_team_owner', role: 'owner' },
      { userId: 'user_team_reader', role: 'reader' },
    ],
  },
] as const
