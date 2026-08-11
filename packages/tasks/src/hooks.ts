/**
 * Optional post-mutation hooks — apps wire notif / audit / product side-effects.
 * Kit never calls side-effects itself (Spark ADR-005 lesson: one write path in app).
 */

export type TaskMutationKind = 'create' | 'update' | 'delete' | 'link_create' | 'link_delete'

export type TaskMutationEvent = {
  kind: TaskMutationKind
  orgId: string
  taskId?: string
  actorId: string
  /** Opaque bag for product (status change, stage change, …). */
  meta?: Record<string, unknown>
}

export type TaskMutationHooks = {
  afterMutation?: (event: TaskMutationEvent) => void | Promise<void>
}

export async function runTaskMutationHook(
  hooks: TaskMutationHooks | undefined,
  event: TaskMutationEvent,
): Promise<void> {
  if (!hooks?.afterMutation) return
  await hooks.afterMutation(event)
}
