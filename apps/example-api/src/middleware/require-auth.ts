import { createBetterAuthSessionPort, createRequireAuth } from '@kit/auth'
import { AppError } from '@kit/core'
import type { MiddlewareHandler } from 'hono'
import type { KitDb } from '../lib/db-type'
import { sessionCookieNameFromEnv } from '../lib/session-env'
import * as keysRepo from '../repos/keys'
import type { AppEnv } from '../types'

function dbFromContext(c: { get: (k: 'db') => KitDb | undefined }): KitDb {
  const existing = c.get('db')
  if (!existing) {
    throw AppError.internal('db not bound — withDb middleware required')
  }
  return existing
}

/**
 * Dual-path auth: Bearer sk_ or Better Auth session cookie → subject + authMethod.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = createRequireAuth((c) => {
  const db = dbFromContext(c as { get: (k: 'db') => KitDb | undefined })
  const cookieName = sessionCookieNameFromEnv(c.env)
  const auth = c.get('betterAuth')
  if (!auth) {
    throw AppError.internal('betterAuth not bound — withBetterAuth middleware required')
  }
  return {
    cookieName,
    sessions: createBetterAuthSessionPort({
      cookieName,
      getAuth: () => auth,
    }),
    findApiKeyByPrefix: async (prefix) => findKeyRecord(db, prefix),
  }
}) as MiddlewareHandler<AppEnv>

/**
 * Org-bound keys only: re-check membership + active org on every use (ADR-0003 D11).
 *
 * A row without `organization_id` is denied outright rather than skipping the re-check.
 * ADR-0003 D11 forbids subject-global keys, so such a row has no valid interpretation:
 * previously it authenticated while bypassing the membership + active-org checks entirely,
 * which meant a key minted before org-binding kept working forever even after its subject
 * was removed from every org.
 *
 * These rows can only be pre-`0008` legacy data: migration `0008_api_keys_organization.sql`
 * added the column nullable and told operators to re-mint but never revoked, and `mintApiKey`
 * now refuses a missing organization unconditionally (`services/auth.ts`).
 *
 * Authority for this rule is **ADR-0003 D11**, not a marker here.
 *
 * Marker asymmetry below is deliberate and measured, not an oversight. This function is
 * module-private, and semctx derives `tested_by` only from a named import inside a test-role file
 * — so no test can ever link to it without exporting it purely to satisfy a tool. Any marker that
 * arms a `block`-tier rule would therefore be permanently unsatisfiable here, and would pressure
 * whoever edits this file next into exporting a private function or stripping a marker while a
 * gate is red. So the two that arm rules are omitted: the invariant marker, and the security tag
 * (both fire on any node kind). The capability marker arms nothing — no rule reads it — so it
 * stays and keeps its navigational value.
 *
 * Names of the omitted markers are written without their leading sigil on purpose: `parseMarkers`
 * runs over the JSDoc attached to a TypeScript symbol, so naming them literally here would declare
 * the very markers this comment says are absent. (That hazard is specific to `.ts` doc comments —
 * Markdown cannot produce a marker.)
 *
 * Precedent for the rule: the `grant.ts` marker that asserted "unknown keys are rejected" while a
 * test in the same commit disproved it. Repo policy — annotate only what a gate can target;
 * otherwise the rule lives in the ADR.
 *
 * @capability auth-api-key-lookup
 *
 * The behaviour is covered by integration: `org-rbac.test.ts` mints a real org-bound key, proves
 * it authenticates, strips only `organization_id`, and requires 401.
 */
async function findKeyRecord(db: KitDb, prefix: string) {
  const row = await keysRepo.findApiKeyByPrefix(db, prefix)
  if (!row) return null
  if (!row.organizationId) return null
  const { findMembership, findOrgById } = await import('../repos/orgs')
  const org = await findOrgById(db, row.organizationId)
  if (org?.status !== 'active') return null
  const membership = await findMembership(db, row.organizationId, row.subject)
  if (!membership) return null
  return {
    subject: row.subject,
    keyHash: row.keyHash,
    revokedAt: row.revokedAt ?? null,
    expiresAt: row.expiresAt ?? null,
    organizationId: row.organizationId,
  }
}
