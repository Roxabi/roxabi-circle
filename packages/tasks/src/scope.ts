/**
 * Opaque product scope on a task.
 * Kit never interprets kind values (project | client | phase | …).
 */
export type ScopeRef = {
  scopeKind: string
  scopeId: string
}

export type Scoped = {
  scopeKind?: string | null
  scopeId?: string | null
}

export function hasScope(row: Scoped): boolean {
  return row.scopeKind != null && row.scopeKind !== '' && row.scopeId != null && row.scopeId !== ''
}

export function scopeEquals(row: Scoped, ref: ScopeRef): boolean {
  return row.scopeKind === ref.scopeKind && row.scopeId === ref.scopeId
}

/** Match scope filter: undefined filter = all; null filter = org-global only (no scope). */
export function matchesScopeFilter(row: Scoped, filter: ScopeRef | null | undefined): boolean {
  if (filter === undefined) return true
  if (filter === null) return !hasScope(row)
  return scopeEquals(row, filter)
}

export function filterByScope<T extends Scoped>(
  rows: readonly T[],
  filter: ScopeRef | null | undefined,
): T[] {
  return rows.filter((r) => matchesScopeFilter(r, filter))
}

export function normalizeScope(
  scopeKind?: string | null,
  scopeId?: string | null,
): { scopeKind: string | null; scopeId: string | null } {
  const kind = scopeKind == null || scopeKind === '' ? null : scopeKind
  const id = scopeId == null || scopeId === '' ? null : scopeId
  if ((kind === null) !== (id === null)) {
    throw new Error('scopeKind and scopeId must both be set or both null')
  }
  return { scopeKind: kind, scopeId: id }
}
