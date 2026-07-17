import { and, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { schema } from '../db/schema'
import { organizationModules, platformModules } from '../db/schema'

type Db = DrizzleD1Database<typeof schema>

export async function listPlatformModules(db: Db) {
  return db.select().from(platformModules)
}

export async function getPlatformModule(db: Db, moduleId: string) {
  const rows = await db
    .select()
    .from(platformModules)
    .where(eq(platformModules.moduleId, moduleId))
    .limit(1)
  return rows[0] ?? null
}

export async function upsertPlatformModule(
  db: Db,
  row: {
    moduleId: string
    available: boolean
    configJson?: string | null
    updatedAt: number
  },
) {
  await db
    .insert(platformModules)
    .values({
      moduleId: row.moduleId,
      available: row.available,
      configJson: row.configJson ?? null,
      updatedAt: row.updatedAt,
    })
    .onConflictDoUpdate({
      target: platformModules.moduleId,
      set: {
        available: row.available,
        configJson: row.configJson ?? null,
        updatedAt: row.updatedAt,
      },
    })
}

export async function setPlatformAvailable(
  db: Db,
  moduleId: string,
  available: boolean,
  updatedAt: number,
) {
  await db
    .update(platformModules)
    .set({ available, updatedAt })
    .where(eq(platformModules.moduleId, moduleId))
}

export async function setPlatformConfig(
  db: Db,
  moduleId: string,
  configJson: string,
  updatedAt: number,
) {
  await db
    .update(platformModules)
    .set({ configJson, updatedAt })
    .where(eq(platformModules.moduleId, moduleId))
}

export async function listOrgModules(db: Db, organizationId: string) {
  return db
    .select()
    .from(organizationModules)
    .where(eq(organizationModules.organizationId, organizationId))
}

export async function getOrgModule(db: Db, organizationId: string, moduleId: string) {
  const rows = await db
    .select()
    .from(organizationModules)
    .where(
      and(
        eq(organizationModules.organizationId, organizationId),
        eq(organizationModules.moduleId, moduleId),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

export async function upsertOrgModule(
  db: Db,
  row: {
    organizationId: string
    moduleId: string
    enabled: boolean
    locked?: boolean
    configJson?: string | null
    updatedAt: number
  },
) {
  await db
    .insert(organizationModules)
    .values({
      organizationId: row.organizationId,
      moduleId: row.moduleId,
      enabled: row.enabled,
      locked: row.locked ?? false,
      configJson: row.configJson ?? null,
      updatedAt: row.updatedAt,
    })
    .onConflictDoUpdate({
      target: [organizationModules.organizationId, organizationModules.moduleId],
      set: {
        enabled: row.enabled,
        locked: row.locked ?? false,
        configJson: row.configJson ?? null,
        updatedAt: row.updatedAt,
      },
    })
}
