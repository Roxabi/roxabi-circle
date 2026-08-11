/**
 * Who is looking — injected by the product, never inferred from kit role strings.
 *
 * - `staff`: agency / internal ops — may see `internal` tasks
 * - `external`: client portal / external principal — `shared` only
 */
export const AUDIENCES = ['staff', 'external'] as const
export type Audience = (typeof AUDIENCES)[number]

export function isAudience(value: unknown): value is Audience {
  return value === 'staff' || value === 'external'
}

/**
 * Product maps session / sk_ / Client Team → Audience.
 * Kit pure helpers only accept a resolved Audience (fail-closed if missing at app layer).
 */
export type AudiencePort = {
  /** Resolve principal → audience for this org (and optional scope). */
  resolveAudience: (input: {
    orgId: string
    principalId: string
    /** Optional product scope (e.g. client fiche, project). */
    scopeKind?: string | null
    scopeId?: string | null
  }) => Audience | Promise<Audience>
}
