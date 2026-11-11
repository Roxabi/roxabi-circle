import { eq } from 'drizzle-orm'
import { kitModules } from '../tenancy-schema'
import type { KitRepoDb } from './db-type'

type Db = KitRepoDb

export async function listKitModules(db: Db) {
  return db.select().from(kitModules).all()
}

export async function getKitModule(db: Db, id: string) {
  return db.select().from(kitModules).where(eq(kitModules.id, id)).get()
}

export async function insertKitModule(
  db: Db,
  id: string,
  enabled: boolean,
  configJson: string | null,
  now: number,
) {
  await db.insert(kitModules).values({ id, enabled, configJson, updatedAt: now }).run()
}

export async function setKitModuleEnabled(db: Db, id: string, enabled: boolean, now: number) {
  await db.update(kitModules).set({ enabled, updatedAt: now }).where(eq(kitModules.id, id)).run()
}

export async function setKitModuleConfig(db: Db, id: string, configJson: string, now: number) {
  await db.update(kitModules).set({ configJson, updatedAt: now }).where(eq(kitModules.id, id)).run()
}
