import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))

function openMigrated() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const migDir = join(__dirname, '../migrations')
  for (const name of readdirSync(migDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    sqlite.exec(readFileSync(join(migDir, name), 'utf8'))
  }
  return sqlite
}

describe('flow_plans / flow_runs schema (composite tenancy FK)', () => {
  it('rejects run whose org_id does not match plan org_id', () => {
    const sqlite = openMigrated()
    const now = Date.now()
    sqlite
      .prepare(
        `INSERT INTO flow_plans (id, org_id, plan_key, version, enabled, plan_json, plan_digest, created_at, updated_at)
         VALUES (?, ?, ?, 1, 1, '{}', 'digest', ?, ?)`,
      )
      .run('plan_a', 'org_a', 'echo', now, now)

    expect(() => {
      sqlite
        .prepare(
          `INSERT INTO flow_runs (
            id, org_id, plan_id, plan_key, status, actor_id, snapshot_json, plan_digest, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('run_x', 'org_b', 'plan_a', 'echo', 'queued', 'user_1', '{}', 'digest', now, now)
    }).toThrow(/FOREIGN KEY/i)
  })

  it('accepts run with matching plan_id + org_id', () => {
    const sqlite = openMigrated()
    const now = Date.now()
    sqlite
      .prepare(
        `INSERT INTO flow_plans (id, org_id, plan_key, version, enabled, plan_json, plan_digest, created_at, updated_at)
         VALUES (?, ?, ?, 1, 1, '{}', 'digest', ?, ?)`,
      )
      .run('plan_a', 'org_a', 'echo', now, now)

    sqlite
      .prepare(
        `INSERT INTO flow_runs (
          id, org_id, plan_id, plan_key, status, actor_id, snapshot_json, plan_digest, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('run_ok', 'org_a', 'plan_a', 'echo', 'queued', 'user_1', '{}', 'digest', now, now)

    const row = sqlite.prepare(`SELECT org_id FROM flow_runs WHERE id = ?`).get('run_ok') as {
      org_id: string
    }
    expect(row.org_id).toBe('org_a')
  })
})
