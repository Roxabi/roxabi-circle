import { encodeListCursor } from '@kit/core'
import { describe, expect, it } from 'vitest'
import {
  kitNotificationDeliveries,
  kitNotificationOrganizationDeliveries,
  kitNotifications,
} from '../drizzle-schema'
import { listDeliveryAdmissionCandidates, recordDeliveryAdmissionObservation } from '../repos'
import { createMemoryD1 } from '../test/memory-d1'

const workflowId = `nd-v1-${'a'.repeat(64)}`
const otherWorkflow = `nd-v1-${'b'.repeat(64)}`
const deadline = 86_400_000

async function seed(
  db: ReturnType<typeof createMemoryD1>['db'],
  id: string,
  orgId = 'org',
  createdAt = 0,
) {
  const rowWorkflow =
    id === 'u_one' || id === 'o_one'
      ? workflowId
      : `nd-v1-${Array.from(new TextEncoder().encode(id.slice(0, 20)), (byte) =>
          byte.toString(16).padStart(2, '0'),
        )
          .join('')
          .padEnd(64, '0')}`
  const common = {
    id,
    orgId,
    channel: 'email',
    status: 'pending',
    createdAt,
    workflowId: rowWorkflow,
    admissionStatus: 'pending',
    admissionDeadlineAt: createdAt + deadline,
    attemptCount: 0,
  }
  if (id.startsWith('u_')) {
    const notificationId = `n_${id}`
    await db
      .insert(kitNotifications)
      .values({
        id: notificationId,
        orgId,
        userId: id,
        typeKey: 'test',
        sourceKind: 'test',
        sourceId: id,
        paramsJson: '{}',
        createdAt,
      })
      .run()
    await db
      .insert(kitNotificationDeliveries)
      .values({ ...common, notificationId })
      .run()
  } else {
    await db
      .insert(kitNotificationOrganizationDeliveries)
      .values({
        ...common,
        destinationId: id,
        typeKey: 'test',
        sourceKind: 'test',
        sourceId: id,
        paramsJson: '{}',
      })
      .run()
  }
}

const ref = (id: string, orgId = 'org') => ({
  orgId,
  kind: (id.startsWith('u_') ? 'user' : 'organization') as 'user' | 'organization',
  id,
})

describe('delivery admission reconciliation', () => {
  it('keeps positive proof, first admitted date and terminal receipt across late and concurrent observations', async () => {
    const { db, sqlite } = createMemoryD1()
    await seed(db, 'u_one')
    sqlite
      .prepare(
        "update kit_notification_deliveries set status='sent', finished_at=50, attempt_count=2, error_code='done' where id='u_one'",
      )
      .run()
    const input = { ref: ref('u_one'), workflowId }
    await Promise.all([
      recordDeliveryAdmissionObservation(db, {
        ...input,
        observedAt: deadline + 3,
        observation: { kind: 'unknown' },
      }),
      recordDeliveryAdmissionObservation(db, {
        ...input,
        observedAt: deadline + 2,
        observation: { kind: 'admitted', proof: 'created' },
      }),
      recordDeliveryAdmissionObservation(db, {
        ...input,
        observedAt: deadline + 1,
        observation: { kind: 'expired' },
      }),
    ])
    const result = await recordDeliveryAdmissionObservation(db, {
      ...input,
      observedAt: deadline + 4,
      observation: { kind: 'admitted', proof: 'instance_present' },
    })
    expect(result.kind).toBe('updated')
    if (result.kind !== 'updated') throw new Error('expected updated receipt')
    expect(result.receipt).toMatchObject({
      admissionStatus: 'admitted',
      admittedAt: deadline + 2,
      lastAdmissionCheckAt: deadline + 4,
      status: 'sent',
      finishedAt: 50,
    })
    const row = sqlite
      .prepare("select attempt_count, error_code from kit_notification_deliveries where id='u_one'")
      .get()
    expect(row).toEqual({ attempt_count: 2, error_code: 'done' })
    const older = await recordDeliveryAdmissionObservation(db, {
      ...input,
      observedAt: 1,
      observation: { kind: 'unknown' },
    })
    expect(older.kind).toBe('unchanged')
    if (older.kind === 'unchanged') expect(older.receipt.lastAdmissionCheckAt).toBe(deadline + 4)
  })

  it('does nothing for early expiry, scopes identity and preserves immutable first proof', async () => {
    const { db } = createMemoryD1()
    await seed(db, 'o_one')
    const input = { ref: ref('o_one'), workflowId }
    const early = await recordDeliveryAdmissionObservation(db, {
      ...input,
      observedAt: 5,
      observation: { kind: 'expired' },
    })
    expect(early).toMatchObject({
      kind: 'unchanged',
      receipt: { admissionStatus: 'pending', lastAdmissionCheckAt: null },
    })
    expect(
      await recordDeliveryAdmissionObservation(db, {
        ...input,
        workflowId: otherWorkflow,
        observedAt: 5,
        observation: { kind: 'unknown' },
      }),
    ).toEqual({ kind: 'identity_mismatch' })
    expect(
      await recordDeliveryAdmissionObservation(db, {
        ...input,
        ref: ref('o_one', 'foreign'),
        observedAt: 5,
        observation: { kind: 'unknown' },
      }),
    ).toEqual({ kind: 'not_found' })
    await recordDeliveryAdmissionObservation(db, {
      ...input,
      observedAt: 10,
      observation: { kind: 'admitted', proof: 'created' },
    })
    const again = await recordDeliveryAdmissionObservation(db, {
      ...input,
      observedAt: 20,
      observation: { kind: 'admitted', proof: 'created' },
    })
    expect(again).toMatchObject({
      kind: 'updated',
      receipt: { admittedAt: 10, lastAdmissionCheckAt: 20 },
    })
  })

  it.each(['u_one', 'o_one'])(
    'reconciles unknown, deadline expiry and late proof for %s',
    async (id) => {
      const { db } = createMemoryD1()
      await seed(db, id)
      const input = { ref: ref(id), workflowId }
      const unknown = await recordDeliveryAdmissionObservation(db, {
        ...input,
        observedAt: deadline - 1,
        observation: { kind: 'unknown' },
      })
      expect(unknown).toMatchObject({
        kind: 'updated',
        receipt: {
          admissionStatus: 'unknown',
          status: 'pending',
          lastAdmissionCheckAt: deadline - 1,
        },
      })
      const expired = await recordDeliveryAdmissionObservation(db, {
        ...input,
        observedAt: deadline,
        observation: { kind: 'unknown' },
      })
      expect(expired).toMatchObject({
        kind: 'updated',
        receipt: { admissionStatus: 'expired', status: 'pending', lastAdmissionCheckAt: deadline },
      })
      const admitted = await recordDeliveryAdmissionObservation(db, {
        ...input,
        observedAt: deadline + 5,
        observation: { kind: 'admitted', proof: 'instance_present' },
      })
      expect(admitted).toMatchObject({
        kind: 'updated',
        receipt: { admissionStatus: 'admitted', admittedAt: deadline + 5, status: 'pending' },
      })
      const later = await recordDeliveryAdmissionObservation(db, {
        ...input,
        observedAt: deadline + 10,
        observation: { kind: 'unknown' },
      })
      expect(later).toMatchObject({
        kind: 'updated',
        receipt: {
          admissionStatus: 'admitted',
          admittedAt: deadline + 5,
          lastAdmissionCheckAt: deadline + 10,
        },
      })
      const older = await recordDeliveryAdmissionObservation(db, {
        ...input,
        observedAt: deadline + 2,
        observation: { kind: 'admitted', proof: 'created' },
      })
      expect(older).toMatchObject({
        kind: 'unchanged',
        receipt: {
          admissionStatus: 'admitted',
          admittedAt: deadline + 5,
          lastAdmissionCheckAt: deadline + 10,
        },
      })
    },
  )

  it('applies the inclusive age and deadline eligibility boundaries', async () => {
    const { db, sqlite } = createMemoryD1()
    await seed(db, 'u_due')
    await seed(db, 'o_expired')
    await seed(db, 'u_admittedpast')
    await seed(db, 'o_age', 'org', deadline - 120_000)
    await seed(db, 'u_young', 'org', deadline - 119_999)
    await seed(db, 'o_admitted', 'org', deadline - 120_000)
    sqlite
      .prepare(
        "update kit_notification_organization_deliveries set admission_status='expired' where id='o_expired'",
      )
      .run()
    sqlite
      .prepare(
        "update kit_notification_deliveries set admission_status='admitted', admitted_at=1 where id='u_admittedpast'",
      )
      .run()
    sqlite
      .prepare(
        "update kit_notification_organization_deliveries set admission_status='admitted', admitted_at=1 where id='o_admitted'",
      )
      .run()
    const page = await listDeliveryAdmissionCandidates(
      db,
      { orgId: 'org' },
      { now: deadline, limit: 100 },
    )
    expect(page.items.map(({ ref: item, action }) => [item.id, action])).toEqual([
      ['u_due', 'expire'],
      ['o_admitted', 'observe'],
      ['o_age', 'observe'],
    ])
    expect(page.nextCursor).toBeNull()
  })

  it('rejects invalid inputs before executing SQL', async () => {
    const { db, boundParams } = createMemoryD1()
    await seed(db, 'u_one')
    const before = boundParams.length
    for (const query of [
      { now: 1, limit: 0 },
      { now: 1, limit: 101 },
      { now: 1, limit: 1.5 },
      { now: -1, limit: 1 },
      { now: Number.MAX_SAFE_INTEGER + 1, limit: 1 },
      { now: 1.5, limit: 1 },
      { now: 1, limit: 1, extra: true },
    ]) {
      await expect(
        listDeliveryAdmissionCandidates(db, { orgId: 'org' }, query as never),
      ).rejects.toThrow()
    }
    const input = { ref: ref('u_one'), workflowId, observedAt: 1 }
    for (const bad of [
      { ...input, observation: { kind: 'unknown', proof: 'created' } },
      { ...input, observation: { kind: 'expired', extra: true } },
      { ...input, observation: { kind: 'admitted' } },
      { ...input, observation: { kind: 'admitted', proof: 'client' } },
      { ...input, observation: { kind: 'other' } },
      { ...input, ref: { ...input.ref, extra: true }, observation: { kind: 'unknown' } },
      { ...input, workflowId: 'nd-v1-short', observation: { kind: 'unknown' } },
      { ...input, observedAt: Number.MAX_SAFE_INTEGER + 1, observation: { kind: 'unknown' } },
      { ...input, observation: { kind: 'unknown' }, extra: true },
    ]) {
      await expect(recordDeliveryAdmissionObservation(db, bad as never)).rejects.toThrow()
    }
    expect(boundParams.length).toBe(before)
    const unchanged = await recordDeliveryAdmissionObservation(db, {
      ...input,
      observation: { kind: 'expired' },
    })
    expect(unchanged).toMatchObject({
      kind: 'unchanged',
      receipt: { admissionStatus: 'pending', lastAdmissionCheckAt: null },
    })
  })

  it('merges kinds fairly, excludes foreign rows and seeks original tuples after observation', async () => {
    const { db } = createMemoryD1()
    for (const id of ['u_b', 'o_a', 'u_c', 'o_d']) await seed(db, id)
    await seed(db, 'o_foreign', 'other')
    const page = await listDeliveryAdmissionCandidates(
      db,
      { orgId: 'org' },
      { now: 200_000, limit: 2 },
    )
    expect(page.items.map((x) => x.ref.id)).toEqual(['o_a', 'o_d'])
    expect(page.nextCursor).toBeTruthy()
    await recordDeliveryAdmissionObservation(db, {
      ref: ref('o_d'),
      workflowId: `nd-v1-${'6f5f64'.padEnd(64, '0')}`,
      observedAt: 200_000,
      observation: { kind: 'unknown' },
    })
    const next = await listDeliveryAdmissionCandidates(
      db,
      { orgId: 'org' },
      { now: 200_000, limit: 2, cursor: page.nextCursor! },
    )
    expect(next.items.map((x) => x.ref.id)).toEqual(['u_b', 'u_c'])
    expect(next.nextCursor).toBeNull()
  })

  it('roundtrips maximal cursor keys and rejects malformed or mismatched continuations', async () => {
    const { db } = createMemoryD1()
    const id = `o_${'z'.repeat(254)}`
    await seed(db, id)
    await seed(db, 'u_z')
    const now = Number.MAX_SAFE_INTEGER
    const page = await listDeliveryAdmissionCandidates(db, { orgId: 'org' }, { now, limit: 1 })
    expect(page.nextCursor!.length).toBeLessThanOrEqual(512)
    expect(
      (
        await listDeliveryAdmissionCandidates(
          db,
          { orgId: 'org' },
          { now, limit: 1, cursor: page.nextCursor! },
        )
      ).items[0]?.ref.id,
    ).toBe('u_z')
    const base = { asOf: now, lastCheckAt: -1, createdAt: 0, kind: 'organization', id }
    const maximum = encodeListCursor({ ...base, lastCheckAt: now, createdAt: now })
    expect(maximum.length).toBeLessThanOrEqual(512)
    expect(
      (
        await listDeliveryAdmissionCandidates(
          db,
          { orgId: 'org' },
          { now, limit: 1, cursor: maximum },
        )
      ).items,
    ).toEqual([])
    for (const bad of [
      { ...base, extra: 1 },
      { ...base, asOf: now - 1 },
      { ...base, lastCheckAt: -2 },
      { ...base, createdAt: 0.5 },
      { ...base, kind: 'user' },
    ]) {
      await expect(
        listDeliveryAdmissionCandidates(
          db,
          { orgId: 'org' },
          { now, limit: 1, cursor: encodeListCursor(bad) },
        ),
      ).rejects.toThrow()
    }
    for (const cursor of ['', '!', 'a'.repeat(513)])
      await expect(
        listDeliveryAdmissionCandidates(db, { orgId: 'org' }, { now, limit: 1, cursor }),
      ).rejects.toThrow()
  })
})
