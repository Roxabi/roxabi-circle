/**
 * Thin role helpers — products still own full authz matrices.
 * Aligns with ADR-0003 system org roles as a default seed only.
 */

export const TASKS_ADMIN_ROLES = ['owner', 'admin'] as const
export type TasksAdminRole = (typeof TASKS_ADMIN_ROLES)[number]

export function isTasksAdminRole(role: string): role is TasksAdminRole {
  return (TASKS_ADMIN_ROLES as readonly string[]).includes(role)
}

/** Default: owner/admin can manage board catalogue (stages). */
export function canAdminTaskBoards(orgRole: string): boolean {
  return isTasksAdminRole(orgRole)
}

/**
 * Default write on tasks for system roles.
 * Product may tighten (e.g. reader never writes) or widen via custom roles.
 */
export function canWriteTasks(orgRole: string): boolean {
  return orgRole === 'owner' || orgRole === 'admin' || orgRole === 'member'
}

export function canReadTasks(orgRole: string): boolean {
  return orgRole === 'owner' || orgRole === 'admin' || orgRole === 'member' || orgRole === 'reader'
}
