import { eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { baUser } from '../db/better-auth-schema'
import { demoUsers, type schema } from '../db/schema'

type Db = DrizzleD1Database<typeof schema>

export async function findUserByEmail(db: Db, email: string) {
  const rows = await db.select().from(demoUsers).where(eq(demoUsers.email, email)).all()
  return rows[0] ?? null
}

/** BA user row by id (session subject). */
export async function findBaUserById(db: Db, userId: string) {
  const rows = await db.select().from(baUser).where(eq(baUser.id, userId)).limit(1)
  return rows[0] ?? null
}

/** BA user by email (exact match — callers should normalize first). */
export async function findBaUserByEmail(db: Db, email: string) {
  const rows = await db.select().from(baUser).where(eq(baUser.email, email)).limit(1)
  return rows[0] ?? null
}
