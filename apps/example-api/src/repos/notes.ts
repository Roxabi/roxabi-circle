import { and, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { demoNotes, type schema } from '../db/schema'

type Db = DrizzleD1Database<typeof schema>

export async function listNotes(db: Db, subject: string) {
  return db.select().from(demoNotes).where(eq(demoNotes.subject, subject)).all()
}

export async function getNote(db: Db, id: string, subject: string) {
  const rows = await db
    .select()
    .from(demoNotes)
    .where(and(eq(demoNotes.id, id), eq(demoNotes.subject, subject)))
    .all()
  return rows[0] ?? null
}

export async function createNote(
  db: Db,
  note: { id: string; subject: string; title: string; body: string; createdAt: number },
) {
  await db.insert(demoNotes).values(note).run()
  return note
}

export async function deleteNote(db: Db, id: string, subject: string) {
  await db
    .delete(demoNotes)
    .where(and(eq(demoNotes.id, id), eq(demoNotes.subject, subject)))
    .run()
}
