import { eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { demoUsers, type schema } from '../db/schema'

type Db = DrizzleD1Database<typeof schema>

export async function findUserByEmail(db: Db, email: string) {
  const rows = await db.select().from(demoUsers).where(eq(demoUsers.email, email)).all()
  return rows[0] ?? null
}
