/**
 * SQLite-backed D1-compatible binding for integration tests.
 * better-sqlite3 works under Vitest (Node). Drizzle D1 driver needs bind/all/raw/run.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const __dirname = dirname(fileURLToPath(import.meta.url))

function applyMigrations(sqlite: Database.Database) {
  const migDir = join(__dirname, '../../migrations')
  // Same order as Wrangler: all *.sql lexical
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
    async first() {
      return sqlite.prepare(sql).get(...binds) ?? null
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
    /** Drizzle D1 uses .raw() → column-ordered value arrays. */
    async raw() {
      return sqlite
        .prepare(sql)
        .raw(true)
        .all(...binds) as unknown[][]
    },
  }
  return stmt
}

function makeD1(sqlite: Database.Database) {
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
  }
}

function makeR2() {
  const store = new Map<string, { body: string }>()
  return {
    async put(key: string, value: string | ArrayBuffer | ArrayBufferView) {
      let body = ''
      if (typeof value === 'string') body = value
      else if (value instanceof ArrayBuffer) body = new TextDecoder().decode(value)
      else if (ArrayBuffer.isView(value)) {
        body = new TextDecoder().decode(
          value instanceof Uint8Array ? value : new Uint8Array(value.buffer),
        )
      } else body = String(value)
      store.set(key, { body })
      return { key }
    },
    async get(key: string) {
      const v = store.get(key)
      if (!v) return null
      return {
        key,
        async text() {
          return v.body
        },
      }
    },
    async delete(key: string | string[]) {
      if (Array.isArray(key)) for (const k of key) store.delete(k)
      else store.delete(key)
    },
    _keys() {
      return [...store.keys()]
    },
  }
}

export type EnvLike = {
  DB: ReturnType<typeof makeD1>
  BUCKET: ReturnType<typeof makeR2>
  SESSION_SECRET?: string
  ENVIRONMENT?: string
  CORS_ORIGINS?: string
  DEMO_USER_EMAIL?: string
  SMTP_HOST?: string
  SMTP_PORT?: string
  SESSION_COOKIE_NAME?: string
  BETTER_AUTH_SECRET?: string
  BETTER_AUTH_URL?: string
  ALLOW_PUBLIC_SIGNUP?: string
}

/** Fresh in-memory SQLite + R2 for each test (same createApp entry as Worker). */
export function createMemoryEnv(overrides?: Partial<EnvLike>): EnvLike {
  const sqlite = new Database(':memory:')
  applyMigrations(sqlite)
  return {
    DB: makeD1(sqlite),
    BUCKET: makeR2(),
    SESSION_SECRET: 'test-session-secret-at-least-32-chars!',
    BETTER_AUTH_SECRET: 'test-better-auth-secret-at-least-32!!',
    BETTER_AUTH_URL: 'http://localhost:8787',
    ENVIRONMENT: 'test',
    DEMO_USER_EMAIL: 'demo@kit.local',
    ...overrides,
  }
}
