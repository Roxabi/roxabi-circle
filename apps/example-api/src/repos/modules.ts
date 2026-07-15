import { eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { kitModules, type schema } from '../db/schema'
import type { KitModuleId } from '../lib/kit-modules'

type Db = DrizzleD1Database<typeof schema>

export async function listKitModules(db: Db) {
  return db.select().from(kitModules).all()
}

export async function getKitModule(db: Db, id: KitModuleId) {
  return db.select().from(kitModules).where(eq(kitModules.id, id)).get()
}

export async function insertKitModule(
  db: Db,
  id: KitModuleId,
  enabled: boolean,
  configJson: string | null,
  now: number,
) {
  await db.insert(kitModules).values({ id, enabled, configJson, updatedAt: now }).run()
}

export async function setKitModuleEnabled(db: Db, id: KitModuleId, enabled: boolean, now: number) {
  await db.update(kitModules).set({ enabled, updatedAt: now }).where(eq(kitModules.id, id)).run()
}

export async function setKitModuleConfig(db: Db, id: KitModuleId, configJson: string, now: number) {
  await db.update(kitModules).set({ configJson, updatedAt: now }).where(eq(kitModules.id, id)).run()
}
