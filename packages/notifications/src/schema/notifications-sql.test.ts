import { getTableName } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { kitNotifications } from '../drizzle-schema'
import { createMemoryD1 } from '../test/memory-d1'

describe('notifications applied SQL', () => {
  it('exports the applied table and enforces full-string cursor and key bounds', () => {
    const { sqlite } = createMemoryD1()
    expect(getTableName(kitNotifications)).toBe('kit_notifications')
    const insert = sqlite.prepare(`INSERT INTO kit_notifications
      (id, org_id, user_id, type_key, source_kind, source_id, params_json, created_at)
      VALUES (?, 'org', 'user', ?, 'kind', 'source', '{}', ?)`)
    insert.run('A'.repeat(256), 'a'.repeat(128), Number.MAX_SAFE_INTEGER)
    for (const [id, type, at] of [
      ['', 'a', 0],
      ['x'.repeat(257), 'a', 0],
      ['a\0z', 'a', 0],
      ['é', 'a', 0],
      ['ok', 'A', 0],
      ['ok', 'a\0z', 0],
      ['ok', 'a'.repeat(129), 0],
      ['ok', 'a', -1],
      ['ok', 'a', Number.MAX_SAFE_INTEGER + 1],
      ['ok', 'a', 1.5],
    ] as const)
      expect(() => insert.run(id, type, at)).toThrow()
  })

  it('enforces tenant FK, cascade, active uniqueness and re-emission', () => {
    const { sqlite } = createMemoryD1()
    const notification = sqlite.prepare(`INSERT INTO kit_notifications
      (id, org_id, user_id, type_key, source_kind, source_id, params_json, created_at)
      VALUES (?, ?, 'user', 'task', 'kind', 'source', '{}', 1)`)
    const delivery = sqlite.prepare(`INSERT INTO kit_notification_deliveries
      (id,org_id,notification_id,channel,status,created_at,workflow_id,admission_status,admission_deadline_at)
      VALUES (?, ?, 'n1', 'email', 'pending', 1, ?, 'pending', ?)`)
    notification.run('n1', 'org1')
    expect(() => notification.run('n2', 'org1')).toThrow()
    expect(() => delivery.run('u_bad', 'org2', `nd-v1-${'a'.repeat(64)}`, 86400001)).toThrow()
    delivery.run('u_good', 'org1', `nd-v1-${'a'.repeat(64)}`, 86400001)
    sqlite.prepare('UPDATE kit_notifications SET resolved_at = 2 WHERE id = ?').run('n1')
    notification.run('n2', 'org1')
    sqlite.prepare('DELETE FROM kit_notifications WHERE id = ?').run('n1')
    expect(sqlite.prepare('SELECT count(*) AS n FROM kit_notification_deliveries').get()).toEqual({
      n: 0,
    })
  })

  it('rejects malformed receipts and deadline overflow', () => {
    const { sqlite } = createMemoryD1()
    const insert = sqlite.prepare(`INSERT INTO kit_notification_organization_deliveries
      (id,org_id,destination_id,channel,type_key,source_kind,source_id,params_json,status,created_at,workflow_id,admission_status,admission_deadline_at)
      VALUES (?, 'org', 'dest', ?, 'task', 'kind', 'source', ?, 'pending', ?, ?, 'pending', ?)`)
    const workflow = `nd-v1-${'a'.repeat(64)}`
    insert.run('o_valid', 'email', '{}', 0, workflow, 86400000)
    sqlite
      .prepare(
        "UPDATE kit_notification_organization_deliveries SET resolved_at = 1 WHERE id = 'o_valid'",
      )
      .run()
    for (const args of [
      ['u_wrong', 'email', '{}', 0, `nd-v1-${'b'.repeat(64)}`, 86400000],
      ['o_foo', 'in_app', '{}', 0, `nd-v1-${'b'.repeat(64)}`, 86400000],
      ['o_foo', 'email', '{', 0, `nd-v1-${'b'.repeat(64)}`, 86400000],
      ['o_foo', 'email', '{}', 0, 'bad', 86400000],
      ['o_foo', 'email', '{}', 0, `nd-v1-${'b'.repeat(64)}`, 86400001],
      [
        'o_foo',
        'email',
        '{}',
        Number.MAX_SAFE_INTEGER,
        `nd-v1-${'b'.repeat(64)}`,
        Number.MAX_SAFE_INTEGER,
      ],
    ] as const)
      expect(() => insert.run(...args)).toThrow()
  })

  it('normalizes selector storage and enforces policy at every rule scope', () => {
    const { sqlite } = createMemoryD1()
    const rule = sqlite.prepare(`INSERT INTO kit_notification_user_rules
      (id,user_id,selector_kind,selector_value,channel,enabled,locked,created_at,updated_at)
      VALUES (?, 'user', ?, ?, ?, ?, ?, 0, 0)`)
    rule.run('rule', 'all', '*', 'email', 1, 0)
    expect(() => rule.run('r2', 'all', 'task', 'slack', 1, 0)).toThrow()
    expect(() => rule.run('r2', 'type', '*', 'slack', 1, 0)).toThrow()
    expect(() => rule.run('r2', 'type', 'task', 'slack', 1, 1)).toThrow()
    expect(() => rule.run('r2', 'type', 'task', 'in_app', 1, 0)).toThrow()
    const deployment = sqlite.prepare(`INSERT INTO kit_notification_deployment_rules
      (id,selector_kind,selector_value,channel,enabled,locked,created_at,updated_at)
      VALUES ('d', 'all', '*', 'email', 1, 1, 0, 0)`)
    expect(() => deployment.run()).toThrow()
  })

  it('keeps collective history independent of destination configuration', () => {
    const { sqlite } = createMemoryD1()
    sqlite
      .prepare(`INSERT INTO kit_notification_destinations
      (id,org_id,channel,external_id,selector_kind,selector_value,created_at,updated_at)
      VALUES ('dest','org','slack','external','all','*',0,0)`)
      .run()
    const insert = sqlite.prepare(`INSERT INTO kit_notification_organization_deliveries
      (id,org_id,destination_id,channel,type_key,source_kind,source_id,params_json,status,created_at,workflow_id,admission_status,admission_deadline_at)
      VALUES (?, 'org', 'dest', 'slack', 'task', 'kind', 'source', '{}', 'pending', 0, ?, 'pending', 86400000)`)
    insert.run('o_first', `nd-v1-${'a'.repeat(64)}`)
    expect(() => insert.run('o_second', `nd-v1-${'b'.repeat(64)}`)).toThrow()
    sqlite
      .prepare(
        "UPDATE kit_notification_organization_deliveries SET resolved_at=1 WHERE id='o_first'",
      )
      .run()
    expect(() => insert.run('o_second', `nd-v1-${'a'.repeat(64)}`)).toThrow()
    insert.run('o_second', `nd-v1-${'b'.repeat(64)}`)
    sqlite.prepare("DELETE FROM kit_notification_destinations WHERE id='dest'").run()
    expect(
      sqlite.prepare('SELECT count(*) AS n FROM kit_notification_organization_deliveries').get(),
    ).toEqual({ n: 2 })
  })
})
