/** System org roles — ADR-0003 Phase A (member.role allowlist). */
export const ORG_ROLE_KEYS = ['owner', 'admin', 'member', 'reader'] as const
export type OrgRoleKey = (typeof ORG_ROLE_KEYS)[number]

const RANK: Record<OrgRoleKey, number> = {
  owner: 40,
  admin: 30,
  member: 20,
  reader: 10,
}

export function isOrgRoleKey(value: string): value is OrgRoleKey {
  return (ORG_ROLE_KEYS as readonly string[]).includes(value)
}

/** True if `have` rank >= `need` rank. */
export function roleAtLeast(have: string, need: OrgRoleKey): boolean {
  if (!isOrgRoleKey(have)) return false
  return RANK[have] >= RANK[need]
}

export type OrgCapability = 'read' | 'write' | 'manage_members' | 'manage_modules' | 'delete_org'

const CAPABILITY_MIN: Record<OrgCapability, OrgRoleKey> = {
  read: 'reader',
  write: 'member',
  manage_members: 'admin',
  manage_modules: 'admin',
  delete_org: 'owner',
}

export function roleHasCapability(role: string, capability: OrgCapability): boolean {
  return roleAtLeast(role, CAPABILITY_MIN[capability])
}

export const PLATFORM_ROLES = ['super_admin', 'staff'] as const
export type PlatformRole = (typeof PLATFORM_ROLES)[number]

export function isPlatformRole(value: string): value is PlatformRole {
  return (PLATFORM_ROLES as readonly string[]).includes(value)
}

export const ORG_KINDS = ['client', 'internal'] as const
export type OrgKind = (typeof ORG_KINDS)[number]

export const ORG_STATUSES = ['active', 'suspended', 'archived'] as const
export type OrgStatus = (typeof ORG_STATUSES)[number]
