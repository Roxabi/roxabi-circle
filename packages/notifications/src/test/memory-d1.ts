import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSqliteD1, type SqliteD1 } from '@kit/db/testing'
import Database from 'better-sqlite3'
import { type DrizzleD1Database, drizzle } from 'drizzle-orm/d1'
import { onTestFinished } from 'vitest'
import { notificationsDrizzleSchema } from '../drizzle-schema'

const migrations = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../apps/example-api/migrations',
)

interface MemoryD1 {
  db: DrizzleD1Database<typeof notificationsDrizzleSchema>
  sqlite: Database.Database
  d1: SqliteD1
  boundParams: number[]
  close(): void
}
export function createMemoryD1(): MemoryD1 {
  const sqlite = new Database(':memory:')
  let closed = false
  const close = () => {
    if (!closed) {
      closed = true
      sqlite.close()
    }
  }
  onTestFinished(close)
  sqlite.pragma('foreign_keys = ON')
  for (const file of readdirSync(migrations)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    sqlite.exec(readFileSync(join(migrations, file), 'utf8'))
  }
  const boundParams: number[] = []
  const d1 = createSqliteD1(sqlite, {
    onBind: (count) => {
      boundParams.push(count)
    },
  })
  const db = drizzle(d1 as Parameters<typeof drizzle>[0], { schema: notificationsDrizzleSchema })
  return { db, sqlite, d1, boundParams, close }
}
