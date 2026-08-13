import type { PlatformRole } from '@kit/auth'
import { eq, inArray } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { schema } from '../db/schema'
import { userPlatformRoles } from '../db/schema'

type Db = DrizzleD1Database<typeof schema>

function asPlatformRole(role: string | null | undefined): PlatformRole | null {
  if (role === 'super_admin' || role === 'staff') return role
  return null
}

export async function getPlatformRole(db: Db, userId: string): Promise<PlatformRole | null> {
  const rows = await db
    .select()
    .from(userPlatformRoles)
    .where(eq(userPlatformRoles.userId, userId))
    .limit(1)
  return asPlatformRole(rows[0]?.role)
}

/** Batch platform roles for a set of user ids (avoids N+1 on admin directory). */
export async function getPlatformRolesForUsers(
  db: Db,
  userIds: string[],
): Promise<Map<string, PlatformRole>> {
  const out = new Map<string, PlatformRole>()
  if (userIds.length === 0) return out
  const rows = await db
    .select()
    .from(userPlatformRoles)
    .where(inArray(userPlatformRoles.userId, userIds))
  for (const row of rows) {
    const role = asPlatformRole(row.role)
    if (role) out.set(row.userId, role)
  }
  return out
}

export async function setPlatformRole(
  db: Db,
  userId: string,
  role: PlatformRole,
  updatedAt = Date.now(),
): Promise<void> {
  await db.insert(userPlatformRoles).values({ userId, role, updatedAt }).onConflictDoUpdate({
    target: userPlatformRoles.userId,
    set: { role, updatedAt },
  })
}
