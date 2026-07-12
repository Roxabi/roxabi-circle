import { hashPassword } from '@gosilex/auth'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { apiKeys, demoNotes, demoUsers, type schema } from '../db/schema'
import { SEED_NOTES, SEED_USERS } from './demo-data'

type Db = DrizzleD1Database<typeof schema>

export type SeedResult = {
  reset: boolean
  users: { id: string; email: string; role: string; created: boolean }[]
  notes: { id: string; subject: string; title: string; created: boolean }[]
}

/** Wipe demo tables (local/dev only). Order: keys → notes → users. */
export async function resetDemoTables(db: Db): Promise<void> {
  await db.delete(apiKeys).run()
  await db.delete(demoNotes).run()
  await db.delete(demoUsers).run()
}

/**
 * Idempotent seed: insert missing users/notes.
 * With `reset: true`, tables are cleared first then fully re-seeded.
 * `notes: false` — users only (login lazy path).
 */
export async function seedDemoDatabase(
  db: Db,
  opts?: { reset?: boolean; now?: number; notes?: boolean },
): Promise<SeedResult> {
  const reset = opts?.reset ?? false
  const withNotes = opts?.notes ?? true
  const now = opts?.now ?? Date.now()

  if (reset) {
    await resetDemoTables(db)
  }

  const existingUsers = await db.select().from(demoUsers).all()
  const userIds = new Set(existingUsers.map((u) => u.id))
  const users: SeedResult['users'] = []

  for (const u of SEED_USERS) {
    if (userIds.has(u.id)) {
      users.push({ id: u.id, email: u.email, role: u.role, created: false })
      continue
    }
    await db
      .insert(demoUsers)
      .values({
        id: u.id,
        email: u.email,
        passwordHash: await hashPassword(u.password),
        createdAt: now,
      })
      .run()
    users.push({ id: u.id, email: u.email, role: u.role, created: true })
  }

  const notes: SeedResult['notes'] = []
  if (withNotes) {
    const existingNotes = await db.select().from(demoNotes).all()
    const noteIds = new Set(existingNotes.map((n) => n.id))

    for (const n of SEED_NOTES) {
      if (noteIds.has(n.id)) {
        notes.push({ id: n.id, subject: n.subject, title: n.title, created: false })
        continue
      }
      await db
        .insert(demoNotes)
        .values({
          id: n.id,
          subject: n.subject,
          title: n.title,
          body: n.body,
          createdAt: now,
        })
        .run()
      notes.push({ id: n.id, subject: n.subject, title: n.title, created: true })
    }
  }

  return { reset, users, notes }
}

/** Lazy bootstrap for login path — users only (notes via `bun run db:seed`). */
export async function ensureDemoUsers(db: Db): Promise<void> {
  await seedDemoDatabase(db, { reset: false, notes: false })
}
