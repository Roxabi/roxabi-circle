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

/** V0: session + admin only; sk_ cannot create runs. */
export function canCreateFlowRun(input: {
  orgRole: string | null | undefined
  platformRole?: string | null
  authMethod?: 'session' | 'api_key'
}): boolean {
  if (input.authMethod === 'api_key') return false
  return canAdminFlows(input)
}
