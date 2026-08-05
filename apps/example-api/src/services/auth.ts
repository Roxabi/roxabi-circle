import {
  apiKeyPrefix,
  createBetterAuthSessionPort,
  generateApiKey,
  hashApiKey,
  resolveDualAuth,
  SESSION_COOKIE,
  type SessionPort,
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
import { ensureDemoUsers } from '../seed/seed-db'

type Db = DrizzleD1Database<typeof schema>

export type { KitRole }
export { roleForSubject }

/** @deprecated prefer ensureDemoUsers from seed — kept name for call sites */
export async function ensureDemoUser(db: Db, opts?: { environment?: string | null }) {
  await ensureDemoUsers(db, opts)
}

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
    /** ADR-0003 — required for multi-tenant keys. */
    organizationId?: string | null
    requireOrganization?: boolean
  },
): Promise<{ id: string; key: string; keyPrefix: string; organizationId: string | null }> {
  const organizationId = opts?.organizationId?.trim() || null
  if (opts?.requireOrganization && !organizationId) {
    throw AppError.validation('organizationId is required to mint an API key')
  }
  if (organizationId) {
    const { findMembership, findOrgById } = await import('../repos/orgs')
    const org = await findOrgById(db, organizationId)
    if (org?.status !== 'active') throw AppError.notFound('Organization not found')
    const membership = await findMembership(db, organizationId, subject)
    if (!membership) throw AppError.forbidden('Not a member of this organization')
  }
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

export async function listApiKeys(db: Db, subject: string) {
  return keysRepo.listApiKeysForSubject(db, subject)
}

export async function revokeApiKey(db: Db, id: string, subject: string): Promise<void> {
  const ok = await keysRepo.revokeApiKey(db, id, subject)
  if (!ok) throw AppError.notFound('API key not found')
}

export async function resolveAuth(
  db: Db,
  _secret: string,
  authorization: string | null,
  cookieHeader: string | null,
  opts: { sessions: SessionPort; cookieName?: string },
): Promise<{
  subject: string
  method: 'session' | 'api_key'
  organizationId?: string | null
} | null> {
  return resolveDualAuth(authorization, cookieHeader, {
    cookieName: opts.cookieName ?? SESSION_COOKIE,
    sessions: opts.sessions,
    findApiKeyByPrefix: async (prefix) => {
      const row = await keysRepo.findApiKeyByPrefix(db, prefix)
      if (!row) return null
      if (row.organizationId) {
        const { findMembership, findOrgById } = await import('../repos/orgs')
        const org = await findOrgById(db, row.organizationId)
        if (org?.status !== 'active') return null
        const membership = await findMembership(db, row.organizationId, row.subject)
        if (!membership) return null
      }
      return {
        subject: row.subject,
        keyHash: row.keyHash,
        revokedAt: row.revokedAt ?? null,
        expiresAt: row.expiresAt ?? null,
        organizationId: row.organizationId ?? null,
      }
    },
  })
}

/** Helper for tests that need a BA SessionPort with mock getAuth. */
export { createBetterAuthSessionPort, DEMO_EMAIL, DEMO_EMAIL_B, DEMO_PASSWORD, DEMO_PASSWORD_B }
