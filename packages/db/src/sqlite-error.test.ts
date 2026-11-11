import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/d1'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { describe, expect, it, onTestFinished } from 'vitest'
import { callSqlite, isUniqueConstraintError, toWorkerdD1Error } from './index'
import { createSqliteD1 } from './test/sqlite-d1'

const notes = sqliteTable('demo_notes', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
})

function memoryDb() {
  const sqlite = new Database(':memory:')
  sqlite.exec('CREATE TABLE demo_notes (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL UNIQUE);')
  onTestFinished(() => {
    sqlite.close()
  })
  return drizzle(createSqliteD1(sqlite) as never, { schema: { notes } })
}

function workerd(sqliteMessage: string, extended: string): Error {
  return new Error(`D1_ERROR: ${sqliteMessage}: SQLITE_CONSTRAINT (extended: ${extended})`, {
    cause: new Error(sqliteMessage),
  })
}

function atDepth(depth: number, leaf: Error): Error {
  let current = leaf
  for (let i = 0; i < depth; i++) current = new Error(`wrap ${i}`, { cause: current })
  return current
}

describe('isUniqueConstraintError', () => {
  it('rejects a plain message that only contains caller data', () => {
    expect(isUniqueConstraintError(new Error('params: unique_plan'))).toBe(false)
    expect(isUniqueConstraintError(new Error('unique constraint on plan_key unique_plan'))).toBe(
      false,
    )
  })

  it('rejects a Drizzle params message even when it copies the extended token', () => {
    const err = new Error('Failed query: insert\nparams: (extended: SQLITE_CONSTRAINT_UNIQUE)')
    err.cause = workerd(
      'NOT NULL constraint failed: flow_plans.unique_key',
      'SQLITE_CONSTRAINT_NOTNULL',
    )
    expect(isUniqueConstraintError(err)).toBe(false)
  })

  it('rejects a workerd NOT NULL error whose column name contains unique', () => {
    expect(
      isUniqueConstraintError(
        workerd('NOT NULL constraint failed: flow_plans.unique_key', 'SQLITE_CONSTRAINT_NOTNULL'),
      ),
    ).toBe(false)
  })

  it('lets the extended suffix win over an engine prefix on the same D1 message', () => {
    expect(
      isUniqueConstraintError(
        new Error(
          'D1_ERROR: UNIQUE constraint failed: flow_plans.id: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_NOTNULL)',
          { cause: new Error('UNIQUE constraint failed: flow_plans.id') },
        ),
      ),
    ).toBe(false)
  })

  it('accepts UNIQUE and PRIMARY KEY on the workerd string', () => {
    expect(
      isUniqueConstraintError(
        workerd(
          'UNIQUE constraint failed: flow_plans.org_id, flow_plans.plan_key',
          'SQLITE_CONSTRAINT_UNIQUE',
        ),
      ),
    ).toBe(true)
    expect(
      isUniqueConstraintError(
        new Error(
          'D1_ERROR: constraint: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_PRIMARYKEY)',
          { cause: new Error('constraint') },
        ),
      ),
    ).toBe(true)
  })

  it('ignores a driver .code that no workerd error sets', () => {
    expect(
      isUniqueConstraintError(
        Object.assign(new Error('constraint'), { code: 'SQLITE_CONSTRAINT_UNIQUE' }),
      ),
    ).toBe(false)
    expect(isUniqueConstraintError(Object.assign(new Error('constraint'), { code: 2067 }))).toBe(
      false,
    )
  })

  it('accepts the engine prefix only at the start of a cause message', () => {
    const err = new Error('Failed query: insert\nparams: unique_plan')
    err.cause = new Error('UNIQUE constraint failed: demo_notes.id')
    expect(isUniqueConstraintError(err)).toBe(true)
    expect(
      isUniqueConstraintError(new Error('D1_ERROR: UNIQUE constraint failed: demo_notes.id')),
    ).toBe(false)
  })

  it('does not see a unique cause past the walk limit, and a self-cause terminates', () => {
    const leaf = new Error('UNIQUE constraint failed: demo_notes.id')
    expect(isUniqueConstraintError(atDepth(7, leaf))).toBe(true)
    expect(isUniqueConstraintError(atDepth(8, leaf))).toBe(false)
    const loop = new Error('NOT NULL constraint failed: demo_notes.title')
    loop.cause = loop
    expect(isUniqueConstraintError(loop)).toBe(false)
  })

  it('reads a non-Error object message and ignores a string cause', () => {
    expect(isUniqueConstraintError({ message: 'UNIQUE constraint failed: demo_notes.id' })).toBe(
      true,
    )
    const err = new Error('Failed query: insert\nparams: unique_plan')
    err.cause = 'UNIQUE constraint failed: demo_notes.id'
    expect(isUniqueConstraintError(err)).toBe(false)
  })

  it('rejects a pre-suffix NOT NULL D1 error whose column contains unique', () => {
    const cause = new Error('NOT NULL constraint failed: t.unique_key')
    const err = new Error('D1_ERROR: NOT NULL constraint failed: t.unique_key: SQLITE_CONSTRAINT', {
      cause,
    })
    expect(isUniqueConstraintError(err)).toBe(false)
    const wrapped = new Error('Failed query: insert\nparams: unique_plan', { cause })
    expect(isUniqueConstraintError(wrapped)).toBe(false)
  })

  it('rethrows sqlite errors as workerd D1 errors, never the raw SqliteError', () => {
    const sqlite = new Database(':memory:')
    onTestFinished(() => {
      sqlite.close()
    })
    sqlite.exec('CREATE TABLE t (id TEXT PRIMARY KEY)')
    sqlite.prepare('INSERT INTO t (id) VALUES (?)').run('a')
    let raw: unknown
    try {
      sqlite.prepare('INSERT INTO t (id) VALUES (?)').run('a')
    } catch (err) {
      raw = err
    }
    expect((raw as Error).name).toBe('SqliteError')
    const wrapped = toWorkerdD1Error(raw)
    expect(wrapped.message.startsWith('D1_ERROR: ')).toBe(true)
    expect(wrapped.cause).toBeInstanceOf(Error)
    expect((wrapped.cause as Error & { code?: unknown }).code).toBeUndefined()
    expect((wrapped.cause as Error).message).toBe((raw as Error).message)
    expect(() =>
      callSqlite(() => {
        throw raw
      }),
    ).toThrowError()
    try {
      callSqlite(() => {
        throw raw
      })
    } catch (err) {
      expect(err).not.toBe(raw)
      expect((err as Error).name).not.toBe('SqliteError')
      expect((err as Error & { code?: unknown }).code).toBeUndefined()
      expect((err as Error).message.startsWith('D1_ERROR: ')).toBe(true)
      expect((err as Error).cause).toBeInstanceOf(Error)
      expect(((err as Error).cause as Error).message).toBe((raw as Error).message)
    }
  })

  it('classifies real memory-D1 UNIQUE and PRIMARY KEY duplicates as the workerd shape', async () => {
    const db = memoryDb()
    await db.insert(notes).values({ id: 'n1', title: 'unique_plan' }).run()

    let uniqueErr: unknown
    try {
      await db.insert(notes).values({ id: 'n2', title: 'unique_plan' }).run()
    } catch (err) {
      uniqueErr = err
    }
    expect(uniqueErr).toBeInstanceOf(Error)
    expect((uniqueErr as Error).message).toContain('unique_plan')
    const uniqueCause = (uniqueErr as Error).cause
    expect(uniqueCause).toBeInstanceOf(Error)
    expect((uniqueCause as Error & { code?: unknown }).code).toBeUndefined()
    expect((uniqueCause as Error).message).toContain('(extended: SQLITE_CONSTRAINT_UNIQUE)')
    expect(isUniqueConstraintError(uniqueErr)).toBe(true)

    let pkErr: unknown
    try {
      await db.insert(notes).values({ id: 'n1', title: 'other' }).run()
    } catch (err) {
      pkErr = err
    }
    const pkCause = (pkErr as Error).cause as Error
    expect(pkCause.message).toContain('(extended: SQLITE_CONSTRAINT_PRIMARYKEY)')
    expect(isUniqueConstraintError(pkErr)).toBe(true)

    let notNullErr: unknown
    try {
      await db
        .insert(notes)
        .values({ id: 'unique_plan', title: null as unknown as string })
        .run()
    } catch (err) {
      notNullErr = err
    }
    expect((notNullErr as Error).message).toContain('unique_plan')
    expect(((notNullErr as Error).cause as Error).message).toContain(
      '(extended: SQLITE_CONSTRAINT_NOTNULL)',
    )
    expect(isUniqueConstraintError(notNullErr)).toBe(false)
  })
})
