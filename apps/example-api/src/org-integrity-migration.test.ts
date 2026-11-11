import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const journal = join(root, 'migrations')
const pending = join(root, 'migrations-pending')
const sql = (dir: string, name: string) => readFileSync(join(dir, name), 'utf8')

function openThrough(last: string) {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  for (const name of readdirSync(journal)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    if (name <= last) db.exec(sql(journal, name))
  }
  return db
}

function taskData(db: Database.Database) {
  return [
    db.prepare('SELECT * FROM kit_tasks ORDER BY id').all(),
    db.prepare('SELECT * FROM kit_task_assignees ORDER BY task_id').all(),
    db.prepare('SELECT * FROM kit_task_links ORDER BY id').all(),
    db.prepare('SELECT * FROM product_child ORDER BY id').all(),
  ]
}

function orgData(db: Database.Database) {
  return [
    db.prepare('SELECT * FROM organization_modules ORDER BY organization_id').all(),
    db.prepare('SELECT * FROM organization_roles ORDER BY id').all(),
    db.prepare('SELECT * FROM organization_role_module_grants ORDER BY role_id').all(),
  ]
}

describe('task stage organization guard', () => {
  it('preserves children and refuses cross-org writes on the post-0019 schema', () => {
    const db = openThrough('0018_tasks_assignees_org.sql')
    try {
      db.exec(
        "INSERT INTO kit_task_stages (id, org_id, board_key, label, position, created_at, updated_at) VALUES ('sa', 'a', 'b', 'A', 0, 1, 1), ('sb', 'b', 'b', 'B', 0, 1, 1)",
      )
      db.exec(
        "INSERT INTO kit_tasks (id, org_id, title, board_key, stage_id, created_by, created_at, updated_at) VALUES ('t1', 'a', 'one', 'b', 'sa', 'u', 1, 1), ('t2', 'a', 'two', 'b', 'sa', 'u', 2, 2)",
      )
      db.exec(
        "INSERT INTO kit_task_assignees (org_id, task_id, user_id, created_at) VALUES ('a', 't1', 'u', 3)",
      )
      db.exec(
        "INSERT INTO kit_task_links (id, org_id, from_task_id, to_task_id, kind, created_at) VALUES ('l', 'a', 't1', 't2', 'blocks', 4)",
      )
      db.exec(
        'CREATE TABLE product_child (id text PRIMARY KEY, task_id text REFERENCES kit_tasks(id) ON DELETE CASCADE)',
      )
      db.exec("INSERT INTO product_child VALUES ('p', 't1')")
      db.exec(sql(journal, '0019_tasks_org_fk_contract.sql'))
      const before = taskData(db)
      db.exec(sql(journal, '0020_tasks_stage_org_guard.sql'))
      expect(taskData(db)).toEqual(before)
      const insert =
        "INSERT INTO kit_tasks (id, org_id, title, board_key, stage_id, created_by, created_at, updated_at) VALUES ('new', 'a', 'new', 'b', 'sb', 'u', 1, 1)"
      expect(() => db.exec(insert)).toThrow('task stage must belong')
      expect(() => db.exec(insert.replace("'sb'", "'missing'"))).toThrow('task stage must belong')
      expect(() => db.exec("UPDATE kit_tasks SET stage_id = 'sb' WHERE id = 't1'")).toThrow(
        'task stage must belong',
      )
      expect(() => db.exec("UPDATE kit_tasks SET org_id = 'b' WHERE id = 't1'")).toThrow(
        'task stage must belong',
      )
      expect(() =>
        db.exec(
          insert
            .replace('INSERT INTO', 'INSERT OR REPLACE INTO')
            .replace("'new', 'a'", "'t1', 'a'"),
        ),
      ).toThrow('task stage must belong')
      expect(() =>
        db.exec(
          insert.replace("'new', 'a'", "'t1', 'a'") +
            ' ON CONFLICT(id) DO UPDATE SET stage_id = excluded.stage_id',
        ),
      ).toThrow('task stage must belong')
      expect(() =>
        db.exec(
          "INSERT INTO kit_tasks (id, org_id, title, board_key, stage_id, created_by, created_at, updated_at) VALUES ('t1', 'a', 'one', 'b', 'sa', 'u', 1, 1) ON CONFLICT(id) DO UPDATE SET stage_id = 'sb'",
        ),
      ).toThrow('task stage must belong')
      expect(() =>
        db.exec(
          "INSERT OR REPLACE INTO kit_task_stages (id, org_id, board_key, label, position, created_at, updated_at) VALUES ('sa', 'b', 'b', 'A', 0, 1, 1)",
        ),
      ).toThrow('referenced task stage')
      expect(() =>
        db.exec("UPDATE OR REPLACE kit_task_stages SET id = 'sa' WHERE id = 'sb'"),
      ).toThrow('referenced task stage')
      db.exec('BEGIN; PRAGMA defer_foreign_keys = ON')
      db.exec("DELETE FROM kit_task_stages WHERE id = 'sa'")
      expect(() =>
        db.exec(
          "INSERT INTO kit_task_stages (id, org_id, board_key, label, position, created_at, updated_at) VALUES ('sa', 'b', 'b', 'A', 0, 1, 1)",
        ),
      ).toThrow('referenced task stage')
      db.exec(
        "INSERT INTO kit_task_stages (id, org_id, board_key, label, position, created_at, updated_at) VALUES ('sa', 'a', 'b', 'A', 0, 1, 1)",
      )
      db.exec('COMMIT')
      expect(() => db.exec("UPDATE kit_task_stages SET org_id = 'b' WHERE id = 'sa'")).toThrow(
        'referenced task stage',
      )
      expect(taskData(db)).toEqual(before)
      expect(db.prepare("SELECT org_id FROM kit_task_stages WHERE id = 'sa'").get()).toEqual({
        org_id: 'a',
      })
      db.exec(
        "INSERT INTO kit_tasks (id, org_id, title, board_key, stage_id, created_by, created_at, updated_at) VALUES ('t3', 'a', 'three', 'b', 'sa', 'u', 5, 5)",
      )
      db.exec("UPDATE kit_tasks SET title = 'changed', stage_id = 'sa' WHERE id = 't1'")
      db.exec("UPDATE kit_task_stages SET label = 'renamed', org_id = 'a' WHERE id = 'sa'")
      expect(
        db.prepare('SELECT id, org_id, title, stage_id FROM kit_tasks ORDER BY id').all(),
      ).toEqual([
        { id: 't1', org_id: 'a', title: 'changed', stage_id: 'sa' },
        { id: 't2', org_id: 'a', title: 'two', stage_id: 'sa' },
        { id: 't3', org_id: 'a', title: 'three', stage_id: 'sa' },
      ])
      expect(db.prepare("SELECT label, org_id FROM kit_task_stages WHERE id = 'sa'").get()).toEqual(
        { label: 'renamed', org_id: 'a' },
      )
      expect(taskData(db).slice(1)).toEqual(before.slice(1))
    } finally {
      db.close()
    }
  })
})

describe('pending organization foreign keys', () => {
  it('refuses a role rebuild with Product children before deleting any rows', () => {
    const db = openThrough('0009_organization_roles_grants.sql')
    try {
      db.exec("INSERT INTO organization (id, name, slug, created_at) VALUES ('a', 'A', 'a', 1)")
      db.exec(
        "INSERT INTO organization_roles VALUES ('ra', 'a', 'owner', 'Owner', 1, 2), ('orphan', 'ghost', 'x', 'X', 0, 3)",
      )
      db.exec("INSERT INTO organization_role_module_grants VALUES ('ra', 'demo', 'write')")
      db.exec(
        'CREATE TABLE product_role_child (id text PRIMARY KEY, role_id text REFERENCES organization_roles(id) ON DELETE CASCADE)',
      )
      db.exec("INSERT INTO product_role_child VALUES ('p', 'ra')")
      const before = orgData(db)
      expect(() => db.exec(sql(pending, '0022_organization_roles_org_fk.sql'))).toThrow(
        'CHECK constraint failed',
      )
      expect(orgData(db)).toEqual(before)
      expect(db.prepare('SELECT * FROM product_role_child').all()).toEqual([
        { id: 'p', role_id: 'ra' },
      ])
    } finally {
      db.close()
    }
  })

  it('refuses a module rebuild when a Product has a restrictive inbound FK', () => {
    const db = openThrough('0008_api_keys_organization.sql')
    try {
      db.exec("INSERT INTO organization (id, name, slug, created_at) VALUES ('a', 'A', 'a', 1)")
      db.exec(
        "INSERT INTO organization_modules VALUES ('a', 'demo', 1, 0, NULL, 1), ('ghost', 'demo', 1, 0, NULL, 2)",
      )
      db.exec(
        'CREATE TABLE product_module_child (org_id text, module_id text, FOREIGN KEY (org_id, module_id) REFERENCES organization_modules(organization_id, module_id) ON DELETE RESTRICT)',
      )
      db.exec("INSERT INTO product_module_child VALUES ('a', 'demo')")
      const before = db.prepare('SELECT * FROM organization_modules ORDER BY organization_id').all()
      expect(() => db.exec(sql(pending, '0021_organization_modules_org_fk.sql'))).toThrow(
        'CHECK constraint failed',
      )
      expect(
        db.prepare('SELECT * FROM organization_modules ORDER BY organization_id').all(),
      ).toEqual(before)
      expect(db.prepare('SELECT * FROM product_module_child').all()).toEqual([
        { org_id: 'a', module_id: 'demo' },
      ])
    } finally {
      db.close()
    }
  })

  it('purges only orphans, preserves valid rows and cascades organization deletion', () => {
    const db = openThrough('0018_tasks_assignees_org.sql')
    try {
      db.exec(
        "INSERT INTO organization (id, name, slug, created_at) VALUES ('a', 'A', 'a', 1), ('b', 'B', 'b', 2)",
      )
      db.exec(
        "INSERT INTO organization_modules VALUES ('a', 'demo', 1, 0, 'config', 11), ('b', 'demo', 0, 1, NULL, 12), ('ghost', 'demo', 1, 0, NULL, 13)",
      )
      db.exec(
        "INSERT INTO organization_roles VALUES ('ra', 'a', 'owner', 'Owner', 1, 21), ('rb', 'b', 'reader', 'Reader', 0, 22), ('orphan', 'ghost', 'x', 'X', 0, 23)",
      )
      db.exec(
        "INSERT INTO organization_role_module_grants VALUES ('ra', 'demo', 'write'), ('rb', 'demo', 'read'), ('orphan', 'demo', 'write'), ('missing', 'demo', 'read')",
      )
      const valid = orgData(db).map((rows) =>
        rows.filter((row) => !/ghost|orphan|missing/.test(JSON.stringify(row))),
      )
      db.exec(sql(pending, '0021_organization_modules_org_fk.sql'))
      db.exec(sql(pending, '0022_organization_roles_org_fk.sql'))
      expect(orgData(db)).toEqual(valid)
      expect(() =>
        db.exec("INSERT INTO organization_modules VALUES ('ghost', 'x', 1, 0, NULL, 1)"),
      ).toThrow('FOREIGN KEY constraint failed')
      expect(() =>
        db.exec("INSERT INTO organization_roles VALUES ('x', 'ghost', 'x', 'X', 0, 1)"),
      ).toThrow('FOREIGN KEY constraint failed')
      expect(() =>
        db.exec("INSERT INTO organization_role_module_grants VALUES ('missing', 'x', 'read')"),
      ).toThrow('FOREIGN KEY constraint failed')
      db.exec("DELETE FROM organization WHERE id = 'a'")
      expect(orgData(db)).toEqual([[valid[0][1]], [valid[1][1]], [valid[2][1]]])
      expect(db.pragma('foreign_key_check')).toEqual([])
    } finally {
      db.close()
    }
  })

  it('applies the core pending script without optional rbac or tasks tables', () => {
    const db = openThrough('0008_api_keys_organization.sql')
    try {
      db.exec(
        "INSERT INTO organization (id, name, slug, created_at) VALUES ('a', 'A', 'a', 1); INSERT INTO organization_modules VALUES ('a', 'demo', 1, 0, NULL, 1)",
      )
      db.exec(sql(pending, '0021_organization_modules_org_fk.sql'))
      expect(db.prepare('SELECT * FROM organization_modules').all()).toEqual([
        {
          organization_id: 'a',
          module_id: 'demo',
          enabled: 1,
          locked: 0,
          config_json: null,
          updated_at: 1,
        },
      ])
      db.exec("DELETE FROM organization WHERE id = 'a'")
      expect(db.prepare('SELECT * FROM organization_modules').all()).toEqual([])
    } finally {
      db.close()
    }
  })
})

describe('pending rbac foreign keys without tasks', () => {
  it('preserves grants and cascades without optional task tables', () => {
    const db = openThrough('0009_organization_roles_grants.sql')
    try {
      db.exec("INSERT INTO organization (id, name, slug, created_at) VALUES ('a', 'A', 'a', 1)")
      db.exec("INSERT INTO organization_roles VALUES ('ra', 'a', 'owner', 'Owner', 1, 2)")
      db.exec("INSERT INTO organization_role_module_grants VALUES ('ra', 'demo', 'write')")
      db.exec(sql(pending, '0022_organization_roles_org_fk.sql'))
      expect(db.prepare('SELECT * FROM organization_roles').all()).toEqual([
        {
          id: 'ra',
          organization_id: 'a',
          key: 'owner',
          name: 'Owner',
          is_system: 1,
          created_at: 2,
        },
      ])
      expect(db.prepare('SELECT * FROM organization_role_module_grants').all()).toEqual([
        { role_id: 'ra', module_id: 'demo', access: 'write' },
      ])
      db.exec("DELETE FROM organization WHERE id = 'a'")
      expect(db.prepare('SELECT * FROM organization_roles').all()).toEqual([])
      expect(db.prepare('SELECT * FROM organization_role_module_grants').all()).toEqual([])
    } finally {
      db.close()
    }
  })
})
