/**
 * Seed dual-KDF note (M-01 hygiene):
 * - `demo_users` is a **legacy demo table** (notes ownership / roleForSubject ids).
 *   It is **not** the Better Auth login path. Hashes use kit `@kit/auth` PBKDF2.
 * - Real session login is BA-only: `seedBaDemoUsers` writes `ba_user` + `ba_account`
 *   with `better-auth/crypto` `hashPassword` (scrypt). Do not mix KDFs across tables.
 */
import { hashPassword } from '@kit/auth'
import { hashPassword as baHashPassword } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { baAccount, baUser } from '../db/better-auth-schema'
import { apiKeys, demoItems, demoNotes, demoUsers, type schema } from '../db/schema'
import * as modulesRepo from '../repos/modules'
import * as platformRolesRepo from '../repos/platform-roles'
import * as modulesService from '../services/modules'
import * as platformModulesService from '../services/platform-modules'
import { SEED_ITEMS, SEED_NOTES, SEED_USERS } from './demo-data'
import { seedTenancyDemo, type TenancySeedResult } from './seed-tenancy'

type Db = DrizzleD1Database<typeof schema>

export type SeedResult = {
  reset: boolean
  users: { id: string; email: string; role: string; created: boolean }[]
  notes: { id: string; subject: string; title: string; created: boolean }[]
  items: { id: string; subject: string; code: string; created: boolean }[]
  modules: { id: string; enabled: boolean; configured: boolean; created: boolean }[]
  tenancy?: TenancySeedResult
}

/** Wipe demo tables (local/dev only). Order: keys → notes → users. */
export async function resetDemoTables(db: Db): Promise<void> {
  await db.delete(apiKeys).run()
  await db.delete(demoNotes).run()
  await db.delete(demoItems).run()
  await db.delete(demoUsers).run()
}

/**
 * BA credential accounts for SEED_USERS (ADR-0002 BA-only login).
 * Idempotent — same ids as demo_users for roleForSubject / notes ownership.
 *
 * **Login path:** uses Better Auth `hashPassword` (not kit PBKDF2).
 * Kit `demo_users` rows below are legacy demo data only — not checked at sign-in.
 */
export async function seedBaDemoUsers(
  db: Db,
  opts?: { now?: Date },
): Promise<{ id: string; email: string; created: boolean }[]> {
  const now = opts?.now ?? new Date()
  const out: { id: string; email: string; created: boolean }[] = []
  for (const u of SEED_USERS) {
    const existing = await db.select().from(baUser).where(eq(baUser.id, u.id)).limit(1)
    if (existing[0]) {
      out.push({ id: u.id, email: u.email, created: false })
      continue
    }
    const passwordHash = await baHashPassword(u.password)
    await db.insert(baUser).values({
      id: u.id,
      name: u.email.split('@')[0] ?? u.id,
      email: u.email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(baAccount).values({
      id: `acc_${u.id}`,
      accountId: u.id,
      providerId: 'credential',
      userId: u.id,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    })
    out.push({ id: u.id, email: u.email, created: true })
  }
  return out
}

/**
 * Idempotent seed: insert missing users/notes.
 * With `reset: true`, tables are cleared first then fully re-seeded.
 * `notes: false` — users only (login lazy path).
 */
export async function seedDemoDatabase(
  db: Db,
  opts?: { reset?: boolean; now?: number; notes?: boolean; environment?: string | null },
): Promise<SeedResult> {
  const reset = opts?.reset ?? false
  const withNotes = opts?.notes ?? true
  const now = opts?.now ?? Date.now()

  if (reset) {
    await resetDemoTables(db)
  }

  // Legacy `demo_users` only (kit PBKDF2). Not BA login — see seedBaDemoUsers.
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
        // @kit/auth PBKDF2 — legacy demo_users table; BA login uses baHashPassword
        passwordHash: await hashPassword(u.password),
        createdAt: now,
      })
      .run()
    users.push({ id: u.id, email: u.email, role: u.role, created: true })
  }

  // Kit demo admin → platform super_admin for catalogue ops
  const admin = SEED_USERS.find((u) => u.role === 'admin')
  if (admin) {
    try {
      await platformRolesRepo.setPlatformRole(db, admin.id, 'super_admin', now)
    } catch {
      /* table may be missing on pre-migration */
    }
  }

  // BA-only login: mirror SEED_USERS into Better Auth credential accounts
  try {
    await seedBaDemoUsers(db, { now: new Date(now) })
  } catch {
    /* BA tables may be missing on incomplete migration */
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

  const items: SeedResult['items'] = []
  {
    const existingItems = await db.select().from(demoItems).all()
    const itemIds = new Set(existingItems.map((i) => i.id))
    for (const it of SEED_ITEMS) {
      if (itemIds.has(it.id)) {
        items.push({ id: it.id, subject: it.subject, code: it.code, created: false })
        continue
      }
      try {
        await db
          .insert(demoItems)
          .values({
            id: it.id,
            subject: it.subject,
            code: it.code,
            label: it.label,
            description: it.description,
            active: true,
            createdAt: now,
            updatedAt: now,
          })
          .run()
        items.push({ id: it.id, subject: it.subject, code: it.code, created: true })
      } catch {
        /* table may be missing pre-migration */
        items.push({ id: it.id, subject: it.subject, code: it.code, created: false })
      }
    }
  }

  const beforeIds = new Set((await modulesRepo.listKitModules(db)).map((r) => r.id))
  await modulesService.ensureKitModules(db)
  // ADR-0003 dual-level catalogue (migrated from kit_modules via SQL + ensure)
  await platformModulesService.ensurePlatformModules(db)

  // Multi-tenant BA personas/orgs (dev|test only) — may flip platform.available (N0 demo)
  let tenancy: TenancySeedResult | undefined
  try {
    tenancy = await seedTenancyDemo(db, { environment: opts?.environment ?? 'test' })
  } catch {
    // Pre-migration or incomplete BA schema — skip tenancy seed
    tenancy = undefined
  }

  const modulesAfter = await modulesService.getModulesState(db)
  const modules = Object.entries(modulesAfter).map(([id, state]) => ({
    id,
    enabled: state.enabled,
    configured: state.configured,
    created: !beforeIds.has(id),
  }))

  return { reset, users, notes, items, modules, tenancy }
}

/**
 * Lazy bootstrap for login path — users only (notes via `bun run db:seed`).
 * **Only** when `environment` is explicitly `development` | `test`.
 * Staging/prod (or missing env) must provision users out-of-band — no auto-seed of demo passwords.
 */
export async function ensureDemoUsers(
  db: Db,
  opts?: { environment?: string | null },
): Promise<void> {
  const env = opts?.environment?.trim().toLowerCase()
  if (env !== 'development' && env !== 'test') {
    return
  }
  await seedDemoDatabase(db, { reset: false, notes: false, environment: env })
}
