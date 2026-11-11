import type { TaskMutationEvent, TaskMutationKind } from './hooks'

/** Audit action names a product writes from `afterMutation`. The kit does not insert. */
export const TASK_AUDIT_ACTIONS = {
  create: 'task.create',
  update: 'task.update',
  delete: 'task.delete',
  link_create: 'task.link_create',
  link_delete: 'task.link_delete',
} as const satisfies Record<TaskMutationKind, string>

/** Same cap as the dogfood sanitizer, so a mapped value is not stripped on insert. */
const META_MAX = 200
const META_KEYS = ['boardKey', 'stageId', 'linkKind'] as const

export type TaskMutationAudit = {
  action: (typeof TASK_AUDIT_ACTIONS)[TaskMutationKind]
  actorUserId: string
  targetType: 'task' | 'task_link'
  targetId: string | null
  orgId: string
  meta?: Record<string, unknown>
}

/** Map a mutation event to an audit row. Unknown meta keys are dropped. */
export function taskMutationAudit(event: TaskMutationEvent): TaskMutationAudit {
  const meta: Record<string, unknown> = {}
  const bag = event.meta
  if (bag) {
    for (const key of META_KEYS) {
      const value = bag[key]
      if (typeof value === 'string' && value.length > 0 && value.length <= META_MAX) {
        meta[key] = value
      }
    }
  }
  const link = event.kind === 'link_create' || event.kind === 'link_delete'
  return {
    action: TASK_AUDIT_ACTIONS[event.kind],
    actorUserId: event.actorId,
    targetType: link ? 'task_link' : 'task',
    targetId: event.taskId ?? null,
    orgId: event.orgId,
    ...(Object.keys(meta).length > 0 ? { meta } : {}),
  }
}
