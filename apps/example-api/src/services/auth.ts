import {
  apiKeyPrefix,
  createBetterAuthSessionPort,
  generateApiKey,
  hashApiKey,
  sessionCookieName,
  verifyApiKey,
} from '@kit/auth'
import type { Env } from '../env'

// re-export crypto helpers used by tests
export { hashApiKey, verifyApiKey }

import { AppError } from '@kit/core'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { schema } from '../db/schema'
import * as keysRepo from '../repos/keys'
import {
  DEMO_EMAIL,
  DEMO_EMAIL_B,
  DEMO_PASSWORD,
  DEMO_PASSWORD_B,
  type KitRole,
  roleForSubject,
} from '../seed/demo-data'

type Db = DrizzleD1Database<typeof schema>

export type { KitRole }
export { roleForSubject }

export function cookieNameFromEnv(env: Env): string {
  return sessionCookieName({ name: env.SESSION_COOKIE_NAME })
}

export async function mintApiKey(
  db: Db,
  subject: string,
  opts?: {
    name?: string
    expiresAt?: number | null
    ttlMs?: number
    /**
     * ADR-0003 D11 — mandatory. Minting without an organization is refused.
     *
     * This was previously gated behind an opt-in `requireOrganization` flag, which only one
     * call site passed: any new route that forgot it minted a subject-global key, the exact
     * state D11 forbids. Fail-closed instead of opt-in, so the guarantee holds by construction
     * rather than by every caller remembering.
     */
    organizationId?: string | null
  },
): Promise<{ id: string; key: string; keyPrefix: string; organizationId: string }> {
  const organizationId = opts?.organizationId?.trim() || null
  if (!organizationId) {
    throw AppError.validation('organizationId is required to mint an API key')
  }
  const { findMembership, findOrgById } = await import('../repos/orgs')
  const org = await findOrgById(db, organizationId)
  if (org?.status !== 'active') throw AppError.notFound('Organization not found')
  const membership = await findMembership(db, organizationId, subject)
  if (!membership) throw AppError.forbidden('Not a member of this organization')
  const key = generateApiKey()
  const keyHash = await hashApiKey(key)
  const keyPrefix = apiKeyPrefix(key)
  const id = crypto.randomUUID()
  const createdAt = Date.now()
  const expiresAt =
    opts?.expiresAt !== undefined ? opts.expiresAt : opts?.ttlMs ? createdAt + opts.ttlMs : null
  await keysRepo.insertApiKey(db, {
    id,
    keyHash,
    keyPrefix,
    subject,
    organizationId,
    name: opts?.name ?? null,
    createdAt,
    expiresAt,
  })
  return { id, key, keyPrefix, organizationId }
}

/**
 * List API keys for subject.
 * D11: pass `{ organizationId }` for api_key auth (scope to key org);
 * omit for session (all subject keys).
 */
export async function listApiKeys(db: Db, subject: string, opts?: { organizationId?: string }) {
  return keysRepo.listApiKeysForSubject(db, subject, opts)
}

export async function revokeApiKey(db: Db, id: string, subject: string): Promise<void> {
  const ok = await keysRepo.revokeApiKey(db, id, subject)
  if (!ok) throw AppError.notFound('API key not found')
}

// `resolveAuth` was removed here: an exported dual-auth resolver with zero call sites that
// carried its own copy of the org/membership re-check. Two copies of one guard is the drift
// mechanism that produced the NULL-org hole in the first place — the surviving copy in
// `middleware/require-auth.ts` was fixed while this one still skipped the check for
// `organization_id IS NULL`. Deleted rather than patched, so the trap cannot come back.
// The supported path is `createRequireAuth` (`middleware/require-auth.ts`).

/** Helper for tests that need a BA SessionPort with mock getAuth. */
export { createBetterAuthSessionPort, DEMO_EMAIL, DEMO_EMAIL_B, DEMO_PASSWORD, DEMO_PASSWORD_B }
