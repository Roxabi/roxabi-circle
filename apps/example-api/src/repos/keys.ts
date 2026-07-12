import { and, eq, isNull } from 'drizzle-orm'
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
