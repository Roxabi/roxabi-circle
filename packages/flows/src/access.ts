import { FLOWS_ADMIN_ROLES, type FlowsAdminRole } from './constants'

export function isFlowsAdminRole(role: string | null | undefined): role is FlowsAdminRole {
  if (!role) return false
  return (FLOWS_ADMIN_ROLES as readonly string[]).includes(role)
}

export function canAdminFlows(input: {
  orgRole: string | null | undefined
  platformRole?: string | null
}): boolean {
  if (input.platformRole === 'super_admin') return true
  return isFlowsAdminRole(input.orgRole)
}

/**
 * V0: only explicit session + admin (or super_admin) may create runs.
 * Missing authMethod → deny (fail-closed; never treat omit as session).
 * api_key → deny until scoped keys land.
 */
export function canCreateFlowRun(input: {
  orgRole: string | null | undefined
  platformRole?: string | null
  /** Required. Omitted/unknown → deny. */
  authMethod: 'session' | 'api_key' | null | undefined
}): boolean {
  if (input.authMethod !== 'session') return false
  return canAdminFlows(input)
}
