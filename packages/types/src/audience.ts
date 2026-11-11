/**
 * Product-resolved object ACL (ADR-0007 D3, ADR-0003 D12).
 * Apps inject `staff` | `external`; kit never infers from role strings.
 */

export const AUDIENCES = ['staff', 'external'] as const
export type Audience = (typeof AUDIENCES)[number]

export function isAudience(value: unknown): value is Audience {
  return value === 'staff' || value === 'external'
}

/**
 * Product maps session / sk_ / Client Team → Audience.
 * Kit helpers only accept a resolved Audience (fail-closed if missing at the app layer).
 */
export type AudiencePort = {
  resolveAudience: (input: {
    orgId: string
    principalId: string
    /** Optional product scope (e.g. client fiche, project). */
    scopeKind?: string | null
    scopeId?: string | null
  }) => Audience | Promise<Audience>
}

export const KIT_VISIBILITIES = ['internal', 'shared'] as const
export type KitVisibility = (typeof KIT_VISIBILITIES)[number]

export type VisibilitySubject = {
  visibility: KitVisibility
}

/** Pure object-ACL helper (D12 layer 2). Module enablement is app-owned. */
export function canViewByAudience(row: VisibilitySubject, audience: Audience): boolean {
  if (audience === 'staff') return true
  return row.visibility === 'shared'
}

/** Fail-closed filter for list endpoints. */
export function filterForAudience<T extends VisibilitySubject>(
  rows: readonly T[],
  audience: Audience,
): T[] {
  if (audience === 'staff') return [...rows]
  return rows.filter((row) => row.visibility === 'shared')
}

/** External principals must not create or flip rows to `internal`. */
export function canSetVisibility(audience: Audience, visibility: KitVisibility): boolean {
  if (audience === 'staff') return true
  return visibility === 'shared'
}
