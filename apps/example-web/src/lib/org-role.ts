/** Shared org role → i18n display (shell, members, admin badges). */

export type OrgRoleMessages = {
  roleOwner: string
  roleAdmin: string
  roleMember: string
  roleReader: string
}

export function orgRoleLabel(role: string, m: OrgRoleMessages): string {
  if (role === 'owner') return m.roleOwner
  if (role === 'admin') return m.roleAdmin
  if (role === 'reader') return m.roleReader
  return m.roleMember
}
