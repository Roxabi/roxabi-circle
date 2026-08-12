import { and, desc, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { apiKeys, type schema } from '../db/schema'

type Db = DrizzleD1Database<typeof schema>

export async function insertApiKey(
  db: Db,
  row: {
    id: string
    keyHash: string
    keyPrefix: string
    subject: string
    organizationId?: string | null
    name?: string | null
    createdAt: number
    expiresAt?: number | null
  },
) {
  await db
    .insert(apiKeys)
    .values({
      id: row.id,
      keyHash: row.keyHash,
      keyPrefix: row.keyPrefix,
      subject: row.subject,
      organizationId: row.organizationId ?? null,
      name: row.name ?? null,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt ?? null,
    })
    .run()
}

/** Active key by prefix (may return revoked/expired — caller filters). */
export async function findApiKeyByPrefix(db: Db, keyPrefix: string) {
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.keyPrefix, keyPrefix)).all()
  return rows[0] ?? null
}

/**
 * Public key metadata (never returns keyHash).
 * When `organizationId` is set, only keys bound to that org are returned (D11 api_key path).
 */
export async function listApiKeysForSubject(
  db: Db,
  subject: string,
  opts?: { organizationId?: string },
) {
  const where = opts?.organizationId
    ? and(eq(apiKeys.subject, subject), eq(apiKeys.organizationId, opts.organizationId))
    : eq(apiKeys.subject, subject)
  return db
    .select({
      id: apiKeys.id,
      subject: apiKeys.subject,
      keyPrefix: apiKeys.keyPrefix,
      organizationId: apiKeys.organizationId,
      name: apiKeys.name,
      createdAt: apiKeys.createdAt,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(where)
    .orderBy(desc(apiKeys.createdAt))
    .all()
}

/** Soft-revoke. Returns true if a row was updated. */
export async function revokeApiKey(db: Db, id: string, subject: string): Promise<boolean> {
  const rows = await db
    .select({ id: apiKeys.id, revokedAt: apiKeys.revokedAt })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.subject, subject)))
    .all()
  const row = rows[0]
  if (!row) return false
  if (row.revokedAt != null) return true
  await db
    .update(apiKeys)
    .set({ revokedAt: Date.now() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.subject, subject)))
    .run()
  return true
}
