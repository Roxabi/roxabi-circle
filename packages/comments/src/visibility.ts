import type { Audience } from './audience'
import type { CommentVisibility } from './constants'

export type VisibilitySubject = {
  visibility: CommentVisibility
}

export function canViewComment(row: VisibilitySubject, audience: Audience): boolean {
  if (audience === 'staff') return true
  return row.visibility === 'shared'
}

export function filterCommentsForAudience<T extends VisibilitySubject>(
  rows: readonly T[],
  audience: Audience,
): T[] {
  if (audience === 'staff') return [...rows]
  return rows.filter((r) => r.visibility === 'shared')
}

export function canSetCommentVisibility(
  audience: Audience,
  visibility: CommentVisibility,
): boolean {
  if (audience === 'staff') return true
  return visibility === 'shared'
}
