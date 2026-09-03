import { baAccount, baMember, baUser, baVerification } from '@kit/auth/schema'
import { and, desc, eq, inArray, like, lt, or } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { demoUsers, type schema, userPlatformRoles } from '../db/schema'

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

/** Insert BA user + credential account (seed / admin provision path). */
export async function insertBaUserWithCredential(
  db: Db,
  row: {
    id: string
    email: string
    name: string
    passwordHash: string
    emailVerified?: boolean
    now?: Date
  },
) {
  const now = row.now ?? new Date()
  await db.insert(baUser).values({
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified ?? true,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(baAccount).values({
    id: `acc_${row.id}`,
    accountId: row.id,
    providerId: 'credential',
    issuer: 'local:credential',
    userId: row.id,
    password: row.passwordHash,
    createdAt: now,
    updatedAt: now,
  })
}

export type ListBaUsersOpts = {
  q?: string
  /** Public page size +1 sentinel already applied by caller. */
  limit?: number
  /** Opaque keyset (epoch ms + id). Scope/search predicates compose in the same WHERE. */
  cursor?: { createdAt: number; id: string }
  /** When set (incl. empty), only these user ids — scope **before** keyset page. */
  userIds?: string[]
}

/** List BA users (newest first). Optional email/name `q` and/or id allowlist. */
export async function listBaUsers(db: Db, opts?: ListBaUsersOpts) {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 101)
  const q = opts?.q?.trim()
  const userIds = opts?.userIds
  const cursor = opts?.cursor

  if (userIds && userIds.length === 0) {
    return []
  }

  const filters = []
  if (userIds) {
    filters.push(inArray(baUser.id, userIds))
  }
  if (q) {
    const pattern = `%${q}%`
    filters.push(or(like(baUser.email, pattern), like(baUser.name, pattern)))
  }
  if (cursor) {
    const cursorDate = new Date(cursor.createdAt)
    filters.push(
      or(
        lt(baUser.createdAt, cursorDate),
        and(eq(baUser.createdAt, cursorDate), lt(baUser.id, cursor.id)),
      ),
    )
  }
  const where =
    filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters)

  const base = db
    .select({
      id: baUser.id,
      email: baUser.email,
      name: baUser.name,
      emailVerified: baUser.emailVerified,
      createdAt: baUser.createdAt,
    })
    .from(baUser)

  const ordered = where
    ? base.where(where).orderBy(desc(baUser.createdAt), desc(baUser.id))
    : base.orderBy(desc(baUser.createdAt), desc(baUser.id))

  return ordered.limit(limit)
}

/** Mint BA-compatible reset-password verification token. Returns raw token. */
export async function insertResetPasswordToken(
  db: Db,
  input: { userId: string; token: string; expiresAt: Date; now?: Date },
) {
  const now = input.now ?? new Date()
  await db.insert(baVerification).values({
    id: `ver_${crypto.randomUUID().replace(/-/g, '')}`,
    identifier: `reset-password:${input.token}`,
    value: input.userId,
    expiresAt: input.expiresAt,
    createdAt: now,
    updatedAt: now,
  })
}

/** Delete verification rows for a user (value = userId). */
export async function deleteVerificationsForUser(db: Db, userId: string) {
  await db.delete(baVerification).where(eq(baVerification.value, userId))
}

/**
 * Compensate a failed provision: members → platform role → verification → account → user.
 * Best-effort ordered deletes (D1 has no multi-statement TX).
 */
export async function deleteBaUserCascade(db: Db, userId: string) {
  await db.delete(baMember).where(eq(baMember.userId, userId))
  await db.delete(userPlatformRoles).where(eq(userPlatformRoles.userId, userId))
  await deleteVerificationsForUser(db, userId)
  await db.delete(baAccount).where(eq(baAccount.userId, userId))
  await db.delete(baUser).where(eq(baUser.id, userId))
}
