/**
 * SQLite-backed D1-compatible handle for @kit/comments repo tests.
 * Table DDL is local (column names from drizzle-schema).
 */

import { createSqliteD1 } from '@kit/db/testing'
import Database from 'better-sqlite3'
import { type DrizzleD1Database, drizzle } from 'drizzle-orm/d1'
import { onTestFinished } from 'vitest'
import { commentsDrizzleSchema } from '../drizzle-schema'

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

const COMMENTS_REPO_DDL = `
CREATE TABLE kit_comments (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'shared',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`

type MemoryD1 = DrizzleD1Database<typeof commentsDrizzleSchema> & { close(): void }

export function createMemoryD1(): MemoryD1 {
  const sqlite = new Database(':memory:')
  const close = closeAfterTest(sqlite)
  sqlite.pragma('foreign_keys = OFF')
  sqlite.exec(COMMENTS_REPO_DDL)
  return Object.assign(
    drizzle(createSqliteD1(sqlite) as Parameters<typeof drizzle>[0], {
      schema: commentsDrizzleSchema,
    }),
    {
      close,
    },
  ) as MemoryD1
}
