import { and, desc, eq, isNull } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { apiKeys, type schema } from '../db/schema'

type Db = DrizzleD1Database<typeof schema>

export async function insertApiKey(
  db: Db,
  row: { id: string; keyHash: string; subject: string; createdAt: number },
) {
  await db.insert(apiKeys).values(row).run()
}

export async function findApiKeyByHash(db: Db, keyHash: string) {
  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
    .all()
  return rows[0] ?? null
}

/** Public key metadata (never returns keyHash). */
export async function listApiKeysForSubject(db: Db, subject: string) {
  return db
    .select({
      id: apiKeys.id,
      subject: apiKeys.subject,
      createdAt: apiKeys.createdAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.subject, subject))
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
