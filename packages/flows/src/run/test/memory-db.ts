/**
 * SQLite-backed D1-compatible binding for @kit/flows/run driver tests.
 * Migrations SSoT: apps/example-api/migrations.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

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

function makeStatement(sqlite: Database.Database, sql: string) {
  let binds: unknown[] = []
  const stmt = {
    bind(...args: unknown[]) {
      binds = args
      return stmt
    },
    async first<T>() {
      return (sqlite.prepare(sql).get(...binds) as T | undefined) ?? null
    },
    async run() {
      const info = sqlite.prepare(sql).run(...binds)
      return {
        success: true,
        meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) },
      }
    },
    async all() {
      return { results: sqlite.prepare(sql).all(...binds), success: true }
    },
    async raw() {
      return sqlite
        .prepare(sql)
        .raw(true)
        .all(...binds) as unknown[][]
    },
  }
  return stmt
}

export function createMemoryDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  applyMigrations(sqlite)
  return {
    prepare(sql: string) {
      return makeStatement(sqlite, sql)
    },
    async batch(statements: { all?: () => Promise<unknown>; run?: () => Promise<unknown> }[]) {
      const out = []
      for (const s of statements) {
        if (typeof s.all === 'function') out.push(await s.all())
        else if (typeof s.run === 'function') out.push(await s.run())
      }
      return out
    },
    async exec(query: string) {
      sqlite.exec(query)
      return { count: 1, duration: 0 }
    },
  } as unknown as D1Database
}
