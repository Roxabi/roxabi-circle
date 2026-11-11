import { encodeListCursor } from '@kit/core'
import { describe, expect, it } from 'vitest'
import { listDeliveryAdmissionCandidates, listInbox } from '../repos'
import { createMemoryD1 } from '../test/memory-d1'

const validationError = { code: 'VALIDATION_ERROR', message: 'Invalid notifications input' }

describe('notification cursor keysets', () => {
  it('rejects an admission cursor with an own __proto__ key', async () => {
    const { db } = createMemoryD1()
    const cursor = encodeListCursor(
      JSON.parse(
        '{"asOf":200000,"lastCheckAt":-1,"createdAt":0,"kind":"user","id":"u_a","__proto__":1}',
      ),
    )

    await expect(
      listDeliveryAdmissionCandidates(db, { orgId: 'org' }, { now: 200_000, limit: 1, cursor }),
    ).rejects.toMatchObject(validationError)
  })

  it('rejects an inbox cursor with an own __proto__ key', async () => {
    const { db } = createMemoryD1()
    const cursor = encodeListCursor(JSON.parse('{"createdAt":0,"id":"u_a","__proto__":1}'))

    await expect(
      listInbox(
        db,
        { orgId: 'org', userId: 'user', readableModuleIds: ['allowed'] },
        { limit: 1, unreadOnly: false, cursor },
      ),
    ).rejects.toMatchObject(validationError)
  })
})
