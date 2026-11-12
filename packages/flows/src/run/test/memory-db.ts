/**
 * SQLite-backed D1-compatible binding for @kit/flows/run driver tests.
 * Migrations SSoT: apps/example-api/migrations.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSqliteD1 } from '@kit/db/testing'
import Database from 'better-sqlite3'
import { onTestFinished } from 'vitest'

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

function applyMigrations(sqlite: Database.Database) {
  const migDir = join(__dirname, '../../../../../apps/example-api/migrations')
  const files = readdirSync(migDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const name of files) {
    sqlite.exec(readFileSync(join(migDir, name), 'utf8'))
  }
}

type MemoryDb = D1Database & { close(): void }

export function createMemoryDb(): MemoryDb {
  const sqlite = new Database(':memory:')
  const close = closeAfterTest(sqlite)
  sqlite.pragma('foreign_keys = ON')
  applyMigrations(sqlite)
  return Object.assign(createSqliteD1(sqlite), {
    close,
  }) as unknown as MemoryDb
}
