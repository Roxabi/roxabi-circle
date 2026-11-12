import type { RunnerView } from './runner-view'

/** True only for a sealed approve task (not invoke, not infer). */
export function isApproveTask(view: RunnerView, taskId: string): boolean {
  const task = view.sealedPlan.tasks[taskId]
  return task?.approve !== undefined && task.invoke === undefined && task.infer === undefined
}

/**
 * CF event type for one approve task. `fa-` + 32 hex chars of SHA-256(taskId).
 * Type charset is letters, digits, `-`, `_` and the limit is 100 characters.
 * The route and the Workflow shell must both call this — a shared literal would
 * let one task's buffered wake satisfy another.
 */
export async function flowApprovalEventType(taskId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(taskId))
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `fa-${hex.slice(0, 32)}`
}
