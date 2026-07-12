import { eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { demoNotes, type schema } from '../db/schema'

type Db = DrizzleD1Database<typeof schema>

export async function listNotes(db: Db) {
  return db.select().from(demoNotes).all()
}

export async function getNote(db: Db, id: string) {
  const rows = await db.select().from(demoNotes).where(eq(demoNotes.id, id)).all()
  return rows[0] ?? null
}

export async function createNote(
  db: Db,
  note: { id: string; title: string; body: string; createdAt: number },
) {
  await db.insert(demoNotes).values(note).run()
  return note
}

export async function deleteNote(db: Db, id: string) {
  await db.delete(demoNotes).where(eq(demoNotes.id, id)).run()
}
