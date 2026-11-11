import Database from 'better-sqlite3'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createDb, D1_IN_ARRAY_CHUNK, mapInChunks } from './index'
import { createSqliteD1 } from './test/sqlite-d1'

const notes = sqliteTable('demo_notes', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})

describe('createDb', () => {
  it('round-trips demo_notes insert + select via D1-shaped client', async () => {
    const sqlite = new Database(':memory:')
    onTestFinished(() => {
      sqlite.close()
    })
    sqlite.exec(`
      CREATE TABLE demo_notes (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
    `)
    const db = createDb(createSqliteD1(sqlite), { notes })
    await db.insert(notes).values({ id: 'n1', title: 'hello', body: 'world', createdAt: 42 }).run()
    const rows = await db.select().from(notes).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.title).toBe('hello')
    expect(rows[0]?.body).toBe('world')
    expect(rows[0]?.createdAt).toBe(42)
  })
})

describe('mapInChunks', () => {
  it('chunks ids and concatenates results', async () => {
    expect(D1_IN_ARRAY_CHUNK).toBe(80)
    const ids = [1, 2, 3, 4, 5]
    const seen: number[][] = []
    const out = await mapInChunks(ids, 2, async (chunk) => {
      seen.push(chunk)
      return chunk.map((n) => n * 10)
    })
    expect(seen).toEqual([[1, 2], [3, 4], [5]])
    expect(out).toEqual([10, 20, 30, 40, 50])
  })
})
