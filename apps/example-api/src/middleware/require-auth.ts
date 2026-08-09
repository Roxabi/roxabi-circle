import { createBetterAuthSessionPort, createRequireAuth } from '@kit/auth'
import { AppError } from '@kit/core'
import type { MiddlewareHandler } from 'hono'
import type { KitDb } from '../lib/db-type'
import { sessionCookieName } from '../lib/session-env'
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
  const cookieName = sessionCookieName(c.env)
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
 * added the column nullable and told operators to re-mint, but never revoked, and the mint
 * path has required an organization since (`services/auth.ts` — `requireOrganization`).
 *
 * @capability auth-api-key-lookup
 * @tag security
 * @invariant api-keys-are-org-bound: a key row whose organization_id is absent never
 *   authenticates — the membership + active-org re-check is not skippable (ADR-0003 D11)
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
