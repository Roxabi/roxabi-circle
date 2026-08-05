import { and, eq, like, or } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { demoItems, type schema } from '../db/schema'

type Db = DrizzleD1Database<typeof schema>

export type DemoItemRow = {
  id: string
  subject: string
  code: string
  label: string
  description: string
  active: boolean
  createdAt: number
  updatedAt: number
}

export async function listItems(db: Db, subject: string, q?: string) {
  if (q?.trim()) {
    const term = `%${q.trim()}%`
    return db
      .select()
      .from(demoItems)
      .where(
        and(
          eq(demoItems.subject, subject),
          or(like(demoItems.code, term), like(demoItems.label, term)),
        ),
      )
      .all()
  }
  return db.select().from(demoItems).where(eq(demoItems.subject, subject)).all()
}

export async function getItem(db: Db, id: string, subject: string) {
  const rows = await db
    .select()
    .from(demoItems)
    .where(and(eq(demoItems.id, id), eq(demoItems.subject, subject)))
    .all()
  return rows[0] ?? null
}

export async function getItemByCode(db: Db, subject: string, code: string) {
  const rows = await db
    .select()
    .from(demoItems)
    .where(and(eq(demoItems.subject, subject), eq(demoItems.code, code)))
    .all()
  return rows[0] ?? null
}

export async function createItem(db: Db, item: DemoItemRow) {
  await db.insert(demoItems).values(item).run()
  return item
}

export async function updateItem(
  db: Db,
  id: string,
  subject: string,
  patch: Partial<Pick<DemoItemRow, 'label' | 'description' | 'active' | 'updatedAt'>>,
) {
  await db
    .update(demoItems)
    .set(patch)
    .where(and(eq(demoItems.id, id), eq(demoItems.subject, subject)))
    .run()
  return getItem(db, id, subject)
}

export async function deleteItem(db: Db, id: string, subject: string) {
  await db
    .delete(demoItems)
    .where(and(eq(demoItems.id, id), eq(demoItems.subject, subject)))
    .run()
}
