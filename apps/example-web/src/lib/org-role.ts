/** Shared org role → i18n display (shell, members, admin badges). */

export type OrgRoleMessages = {
  roleOwner: string
  roleAdmin: string
  roleMember: string
  roleReader: string
}

/**
 * System roles use catalogs. Custom Phase B keys must not fall through to "Member".
 * Pass `nameByKey` from roles list when available; else return the raw key.
 */
export function orgRoleLabel(
  role: string,
  m: OrgRoleMessages,
  nameByKey?: ReadonlyMap<string, string> | Readonly<Record<string, string>>,
): string {
  if (role === 'owner') return m.roleOwner
  if (role === 'admin') return m.roleAdmin
  if (role === 'reader') return m.roleReader
  if (role === 'member') return m.roleMember
  if (!nameByKey) return role
  if (nameByKey instanceof Map) {
    return nameByKey.get(role) ?? role
  }
  const record = nameByKey as Readonly<Record<string, string>>
  return record[role] ?? role
}
