import type { PlatformRole } from '@gosilex/auth'
import { eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { schema } from '../db/schema'
import { userPlatformRoles } from '../db/schema'

type Db = DrizzleD1Database<typeof schema>

export async function getPlatformRole(db: Db, userId: string): Promise<PlatformRole | null> {
  const rows = await db
    .select()
    .from(userPlatformRoles)
    .where(eq(userPlatformRoles.userId, userId))
    .limit(1)
  const role = rows[0]?.role
  if (role === 'super_admin' || role === 'staff') return role
  return null
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
