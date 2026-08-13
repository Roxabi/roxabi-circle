import type { CommentTarget } from './schema'

export function targetKey(target: CommentTarget): string {
  return `${target.targetType}:${target.targetId}`
}

export function matchesTarget(
  row: { targetType: string; targetId: string },
  target: CommentTarget,
): boolean {
  return row.targetType === target.targetType && row.targetId === target.targetId
}

export function filterByTarget<T extends { targetType: string; targetId: string }>(
  rows: readonly T[],
  target: CommentTarget,
): T[] {
  return rows.filter((r) => matchesTarget(r, target))
}

/** Well-known compose with @kit/tasks. */
export function taskCommentTarget(taskId: string): CommentTarget {
  return { targetType: 'task', targetId: taskId }
}
