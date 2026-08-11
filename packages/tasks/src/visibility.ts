import type { Audience } from './audience'
import type { TaskVisibility } from './constants'

export type VisibilitySubject = {
  visibility: TaskVisibility
}

/**
 * Pure object-ACL helper (D12 layer 2).
 * Module enablement is app-owned (requireModule).
 */
export function canViewTask(task: VisibilitySubject, audience: Audience): boolean {
  if (audience === 'staff') return true
  // external
  return task.visibility === 'shared'
}

/** Fail-closed filter for list endpoints. */
export function filterTasksForAudience<T extends VisibilitySubject>(
  tasks: readonly T[],
  audience: Audience,
): T[] {
  if (audience === 'staff') return [...tasks]
  return tasks.filter((t) => t.visibility === 'shared')
}

/**
 * Whether an audience may set a visibility value.
 * External principals must not create or flip tasks to `internal`.
 */
export function canSetVisibility(audience: Audience, visibility: TaskVisibility): boolean {
  if (audience === 'staff') return true
  return visibility === 'shared'
}
