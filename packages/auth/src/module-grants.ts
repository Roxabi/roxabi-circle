/**
 * Pure module-grant helpers — ADR-0003 Phase B.
 * Runtime resolution uses DB grants; system matrix is seed-only.
 */

import { isOrgRoleKey, ORG_ROLE_KEYS, type OrgRoleKey } from './org-roles'

export const MODULE_ACCESS_LEVELS = ['write', 'read', 'disabled'] as const
export type ModuleAccess = (typeof MODULE_ACCESS_LEVELS)[number]

export type ModuleOp = 'read' | 'write'

export function isModuleAccess(value: string): value is ModuleAccess {
  return (MODULE_ACCESS_LEVELS as readonly string[]).includes(value)
}

/** Rank for ceiling comparisons (higher = more power). */
const ACCESS_RANK: Record<ModuleAccess, number> = {
  write: 2,
  read: 1,
  disabled: 0,
}

export function accessAllows(access: ModuleAccess | null | undefined, op: ModuleOp): boolean {
  if (!access || access === 'disabled') return false
  if (op === 'read') return access === 'read' || access === 'write'
  return access === 'write'
}

/**
 * System seed defaults (Phase A code matrix → seed only after Phase B).
 * owner|admin|member → write · reader → read
 */
export function systemRoleDefaultAccess(role: OrgRoleKey): ModuleAccess {
  if (role === 'reader') return 'read'
  return 'write'
}

/** Seed grant matrix for all system roles × module ids. */
export function systemRoleGrantSeed(
  moduleIds: readonly string[],
): Array<{ roleKey: OrgRoleKey; moduleId: string; access: ModuleAccess }> {
  const rows: Array<{ roleKey: OrgRoleKey; moduleId: string; access: ModuleAccess }> = []
  for (const roleKey of ORG_ROLE_KEYS) {
    const access = systemRoleDefaultAccess(roleKey)
    for (const moduleId of moduleIds) {
      rows.push({ roleKey, moduleId, access })
    }
  }
  return rows
}

/**
 * Whether actor grants dominate target grants on every module
 * (cannot assign a role that is stronger on any module).
 * Missing entry treated as disabled.
 */
export function grantsDominate(
  actor: ReadonlyMap<string, ModuleAccess>,
  target: ReadonlyMap<string, ModuleAccess>,
  moduleIds: readonly string[],
): boolean {
  for (const moduleId of moduleIds) {
    const a = actor.get(moduleId) ?? 'disabled'
    const t = target.get(moduleId) ?? 'disabled'
    if (ACCESS_RANK[a] < ACCESS_RANK[t]) return false
  }
  return true
}

/** Valid role string for membership: system key or known custom key for the org. */
export function isAssignableRoleKey(
  role: string,
  customKeys: ReadonlySet<string> | readonly string[],
): boolean {
  if (isOrgRoleKey(role)) return true
  if (customKeys instanceof Set) return customKeys.has(role)
  return (customKeys as readonly string[]).includes(role)
}
