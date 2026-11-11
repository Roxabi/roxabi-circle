import { describe, expect, it } from 'vitest'
import type { AuditRow, RuleScope } from '../repos'
import { deleteRule, listRules, putRule } from '../repos'
import { createMemoryD1 } from '../test/memory-d1'

const query = { limit: 100 }
const rule = {
  id: 'rule-1',
  selector: { kind: 'all' } as const,
  channel: 'slack',
  enabled: true,
  locked: false,
}
const audit = (
  id: string,
  targetId: string,
  orgId: string | null,
  action = 'notification.rule.set',
): AuditRow => ({
  id,
  actorUserId: 'admin',
  orgId,
  targetId,
  action,
  meta: {},
  createdAt: 10,
})

describe('rule repository', () => {
  it.each([
    [{ level: 'deployment' } as const, null],
    [{ level: 'organization', orgId: 'org-a' } as const, 'org-a'],
    [{ level: 'user', userId: 'user-a' } as const, null],
  ])('upserts the natural key and preserves identity in %s', async (scope, orgId) => {
    const { db, sqlite } = createMemoryD1()
    const admin = scope.level !== 'user'
    const first = await putRule(
      db,
      scope,
      rule,
      10,
      admin ? audit('audit-1', rule.id, orgId) : undefined,
    )
    const second = await putRule(
      db,
      scope,
      { ...rule, id: 'candidate', enabled: false },
      20,
      admin ? audit('audit-2', 'candidate', orgId) : undefined,
    )
    expect(first).toMatchObject({ id: 'rule-1', createdAt: 10, updatedAt: 10, enabled: true })
    expect(second).toMatchObject({ id: 'rule-1', createdAt: 10, updatedAt: 20, enabled: false })
    expect((await listRules(db, scope, query)).items).toEqual([second])
    const events = sqlite
      .prepare('SELECT target_id, action, org_id FROM audit_events ORDER BY id')
      .all()
    expect(events).toEqual(
      admin
        ? [
            { target_id: 'rule-1', action: 'notification.rule.set', org_id: orgId },
            { target_id: 'rule-1', action: 'notification.rule.set', org_id: orgId },
          ]
        : [],
    )
  })

  it('audits only changes and rejects audit for user rules', async () => {
    const { db, sqlite } = createMemoryD1()
    const scope = { level: 'organization', orgId: 'org-a' } as const
    await expect(
      putRule(db, scope, rule, 10, { ...audit('bad-action', rule.id, 'org-a'), action: 'other' }),
    ).rejects.toThrow()
    await expect(
      putRule(db, scope, rule, 10, { ...audit('bad-actor', rule.id, 'org-a'), actorUserId: '' }),
    ).rejects.toThrow()
    await expect(putRule(db, scope, rule, 10)).rejects.toThrow()
    await putRule(db, scope, rule, 10, audit('a1', rule.id, 'org-a'))
    const same = await putRule(
      db,
      scope,
      { ...rule, id: 'candidate' },
      20,
      audit('a2', 'candidate', 'org-a'),
    )
    expect(same).toMatchObject({ id: rule.id, updatedAt: 10 })
    expect(
      await deleteRule(
        db,
        scope,
        'missing',
        audit('a3', 'missing', 'org-a', 'notification.rule.delete'),
      ),
    ).toBe(false)
    expect(
      await deleteRule(
        db,
        scope,
        rule.id,
        audit('a4', rule.id, 'org-a', 'notification.rule.delete'),
      ),
    ).toBe(true)
    expect(sqlite.prepare('SELECT action FROM audit_events ORDER BY id').all()).toEqual([
      { action: 'notification.rule.set' },
      { action: 'notification.rule.delete' },
    ])
    const event = sqlite.prepare('SELECT meta_json FROM audit_events WHERE id = ?').get('a1') as {
      meta_json: string
    }
    expect(JSON.parse(event.meta_json)).toMatchObject({
      selectorKind: 'all',
      channel: 'slack',
      enabled: true,
      locked: false,
    })
    const user = { level: 'user', userId: 'user-a' } as const
    await expect(putRule(db, user, rule, 10, audit('a5', rule.id, null))).rejects.toThrow()
    await expect(putRule(db, user, { ...rule, locked: true }, 10)).rejects.toThrow()
    await putRule(db, user, rule, 10)
    await expect(
      deleteRule(db, user, rule.id, audit('a6', rule.id, null, 'notification.rule.delete')),
    ).rejects.toThrow()
  })

  it('isolates organization and user owners and rejects malformed scopes and audits', async () => {
    const { db } = createMemoryD1()
    const a = { level: 'organization', orgId: 'org-a' } as const
    const b = { level: 'organization', orgId: 'org-b' } as const
    await putRule(db, a, rule, 10, audit('a1', rule.id, 'org-a'))
    expect((await listRules(db, b, query)).items).toEqual([])
    expect(
      await deleteRule(db, b, rule.id, audit('a2', rule.id, 'org-b', 'notification.rule.delete')),
    ).toBe(false)
    await expect(
      putRule(db, b, { ...rule, id: 'r2' }, 10, audit('a3', 'r2', 'org-a')),
    ).rejects.toThrow()
    await putRule(db, { level: 'user', userId: 'user-a' }, { ...rule, id: 'user-rule' }, 10)
    expect((await listRules(db, { level: 'user', userId: 'user-b' }, query)).items).toEqual([])
    await expect(listRules(db, { level: 'organization' } as RuleScope, query)).rejects.toThrow()
    await expect(
      listRules(db, { level: 'deployment', orgId: 'org-a' } as RuleScope, query),
    ).rejects.toThrow()
    await expect(
      putRule(
        db,
        a,
        { ...rule, selector: { kind: 'all', value: 'bad' } } as typeof rule,
        10,
        audit('a4', rule.id, 'org-a'),
      ),
    ).rejects.toThrow()
    expect((await listRules(db, a, query)).items).toHaveLength(1)
  })

  it('rolls back a changed rule when the audit insert collides', async () => {
    const { db, sqlite } = createMemoryD1()
    const scope = { level: 'organization', orgId: 'org-a' } as const
    await putRule(db, scope, rule, 10, audit('collision', rule.id, 'org-a'))
    await expect(
      putRule(db, scope, { ...rule, enabled: false }, 20, audit('collision', rule.id, 'org-a')),
    ).rejects.toThrow()
    expect((await listRules(db, scope, query)).items[0]).toMatchObject({
      enabled: true,
      updatedAt: 10,
    })
    expect(sqlite.prepare('SELECT count(*) AS n FROM audit_events').get()).toEqual({ n: 1 })
  })
})
