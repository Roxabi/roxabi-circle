import { describe, expect, it } from 'vitest'
import type { AuditRow } from '../repos'
import {
  admitNotifications,
  createDestination,
  deleteDestination,
  listDestinations,
  loadDelivery,
  updateDestinationSelector,
} from '../repos'
import { createMemoryD1 } from '../test/memory-d1'

const query = { limit: 100 }
const externalId = JSON.stringify(['slack', 'install-1', 'channel-1'])
const audit = (id: string, targetId: string, orgId: string, action: string): AuditRow => ({
  id,
  actorUserId: 'admin',
  orgId,
  targetId,
  action,
  meta: {},
  createdAt: 10,
})
const created = (id: string, orgId = 'org-a') => ({
  orgId,
  id,
  channel: 'slack',
  externalId,
  selector: { kind: 'all' } as const,
  now: 10,
  audit: audit(`audit-${id}`, id, orgId, 'slack.destination_created'),
})

describe('destination repository', () => {
  it('enforces natural identity, changes only the selector, and audits actual changes', async () => {
    const { db, sqlite } = createMemoryD1()
    const initial = await createDestination(db, created('dest-1'))
    expect(initial).toMatchObject({
      id: 'dest-1',
      orgId: 'org-a',
      channel: 'slack',
      externalId,
      createdAt: 10,
      updatedAt: 10,
    })
    await expect(createDestination(db, created('dest-2'))).rejects.toThrow()
    const change = {
      orgId: 'org-a',
      id: 'dest-1',
      selector: { kind: 'type', value: 'task.opened' } as const,
      now: 20,
      audit: audit('update', 'dest-1', 'org-a', 'slack.destination_updated'),
    }
    const updated = await updateDestinationSelector(db, change)
    expect(updated).toEqual({ ...initial, selector: change.selector, updatedAt: 20 })
    expect(
      await updateDestinationSelector(db, {
        ...change,
        now: 30,
        audit: audit('noop', 'dest-1', 'org-a', 'slack.destination_updated'),
      }),
    ).toEqual(updated)
    expect((await listDestinations(db, 'org-a', query)).items).toEqual([updated])
    expect(sqlite.prepare('SELECT action, target_id FROM audit_events ORDER BY id').all()).toEqual([
      { action: 'slack.destination_created', target_id: 'dest-1' },
      { action: 'slack.destination_updated', target_id: 'dest-1' },
    ])
  })

  it('isolates tenants and rejects mismatched audit ownership', async () => {
    const { db, sqlite } = createMemoryD1()
    await createDestination(db, created('dest-1'))
    expect((await listDestinations(db, 'org-b', query)).items).toEqual([])
    expect(
      await updateDestinationSelector(db, {
        orgId: 'org-b',
        id: 'dest-1',
        selector: { kind: 'category', value: 'task' },
        now: 20,
        audit: audit('wrong-update', 'dest-1', 'org-b', 'slack.destination_updated'),
      }),
    ).toBeNull()
    expect(
      await deleteDestination(
        db,
        'org-b',
        'dest-1',
        audit('wrong-delete', 'dest-1', 'org-b', 'slack.destination_deleted'),
      ),
    ).toBe(false)
    await expect(
      createDestination(db, {
        ...created('dest-2'),
        audit: audit('bad', 'dest-2', 'org-b', 'slack.destination_created'),
      }),
    ).rejects.toThrow()
    expect((await listDestinations(db, 'org-a', query)).items).toHaveLength(1)
    expect(sqlite.prepare('SELECT count(*) AS n FROM audit_events').get()).toEqual({ n: 1 })
  })

  it('rolls back destination mutations on audit collision', async () => {
    const { db } = createMemoryD1()
    await createDestination(db, created('dest-1'))
    await expect(
      updateDestinationSelector(db, {
        orgId: 'org-a',
        id: 'dest-1',
        selector: { kind: 'category', value: 'task' },
        now: 20,
        audit: audit('audit-dest-1', 'dest-1', 'org-a', 'slack.destination_updated'),
      }),
    ).rejects.toThrow()
    expect((await listDestinations(db, 'org-a', query)).items[0]).toMatchObject({
      selector: { kind: 'all' },
      updatedAt: 10,
    })
    await expect(
      deleteDestination(
        db,
        'org-a',
        'dest-1',
        audit('audit-dest-1', 'dest-1', 'org-a', 'slack.destination_deleted'),
      ),
    ).rejects.toThrow()
    expect((await listDestinations(db, 'org-a', query)).items).toHaveLength(1)
  })

  it('preserves delivery history after destination deletion', async () => {
    const { db, sqlite } = createMemoryD1()
    await createDestination(db, created('dest-1'))
    const ref = { orgId: 'org-a', kind: 'organization', id: 'o_delivery' } as const
    await admitNotifications(
      db,
      {
        orgId: 'org-a',
        type: 'task.opened',
        moduleId: null,
        source: { kind: 'task', id: 'task-1' },
        params: {},
        now: 100,
        users: [],
        organizations: [{ id: ref.id, destinationId: 'dest-1', channel: 'slack' }],
      },
      [{ ref, workflowId: `nd-v1-${'a'.repeat(64)}`, admissionDeadlineAt: 86400100 }],
    )
    const before = await loadDelivery(db, ref)
    expect(before).toMatchObject({ destinationId: 'dest-1', status: 'pending' })
    expect(
      await deleteDestination(
        db,
        'org-a',
        'dest-1',
        audit('deleted', 'dest-1', 'org-a', 'slack.destination_deleted'),
      ),
    ).toBe(true)
    expect(await loadDelivery(db, ref)).toEqual(before)
    expect((await listDestinations(db, 'org-a', query)).items).toEqual([])
    expect(
      await deleteDestination(
        db,
        'org-a',
        'dest-1',
        audit('delete-again', 'dest-1', 'org-a', 'slack.destination_deleted'),
      ),
    ).toBe(false)
    expect(
      sqlite
        .prepare(
          "SELECT count(*) AS n FROM audit_events WHERE action = 'slack.destination_deleted'",
        )
        .get(),
    ).toEqual({ n: 1 })
  })
})
