/**
 * SQLite-backed D1-compatible handle for @kit/tasks repo tests.
 * Applies the REAL migrations (SSoT: apps/example-api/migrations) with foreign keys ON, as D1
 * does — a hand-copied DDL without FKs would hide exactly the tenancy rules these tests prove.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSqliteD1 } from '@kit/db/testing'
import Database from 'better-sqlite3'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { drizzle } from 'drizzle-orm/d1'
import { onTestFinished } from 'vitest'
import { tasksDrizzleSchema } from '../drizzle-schema'

function closeAfterTest(sqlite: Database.Database): () => void {
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    sqlite.close()
  }
  onTestFinished(close)
  return close
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../../../../apps/example-api/migrations')

function applyMigrations(sqlite: Database.Database) {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const name of files) {
    sqlite.exec(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'))
  }
}

interface MemoryD1 {
  db: DrizzleD1Database<typeof tasksDrizzleSchema>
  sqlite: Database.Database
  boundParams: number[]
  close(): void
}

/**
 * `db` for the repos under test, `sqlite` for raw SQL (FK probes, row counts), `boundParams` the
 * bind count of every statement prepared with binds (D1 rejects more than ~100 per statement).
 */
export function createMemoryD1(): MemoryD1 {
  const sqlite = new Database(':memory:')
  const close = closeAfterTest(sqlite)
  sqlite.pragma('foreign_keys = ON')
  applyMigrations(sqlite)
  const boundParams: number[] = []
  const d1 = createSqliteD1(sqlite, {
    onBind(parameterCount) {
      boundParams.push(parameterCount)
    },
  })
  return {
    db: drizzle(d1 as Parameters<typeof drizzle>[0], { schema: tasksDrizzleSchema }),
    sqlite,
    boundParams,
    close,
  }
}
