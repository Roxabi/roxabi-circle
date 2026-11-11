import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  findImpersonationSession,
  getImpersonationPermissions,
  listImpersonationPermissions,
  recordImpersonationRequest,
  setImpersonationPermissions,
  startImpersonationSession,
  stopImpersonationSession,
} from './impersonation'
import { createMemoryD1 } from './memory-d1'

const context = { actorUserId: 'actor' }
const row = {
  id: 'delegation',
  sessionId: 'session',
  actorUserId: 'actor',
  subjectUserId: 'subject',
  organizationId: 'org',
  mode: 'write' as const,
  createdAt: 1,
}

describe('impersonation persistence', () => {
  it('defaults each permission off and stores read and write independently', async () => {
    const db = createMemoryD1()
    expect(await listImpersonationPermissions(db)).toEqual([
      { role: 'staff', read: false, write: false },
      { role: 'super_admin', read: false, write: false },
    ])
    await setImpersonationPermissions(db, { role: 'staff', read: false, write: true }, context)
    expect(await getImpersonationPermissions(db, 'staff')).toEqual({ read: false, write: true })
    expect(await getImpersonationPermissions(db, 'super_admin')).toEqual({
      read: false,
      write: false,
    })
  })

  it('rolls back permission and start mutations when audit insertion fails', async () => {
    const db = createMemoryD1()
    await setImpersonationPermissions(db, { role: 'staff', read: false, write: true }, context)
    await db.run(sql`DROP TABLE audit_events`)
    await expect(
      setImpersonationPermissions(db, { role: 'staff', read: true, write: false }, context),
    ).rejects.toThrow()
    expect(await getImpersonationPermissions(db, 'staff')).toEqual({ read: false, write: true })
    await expect(startImpersonationSession(db, row, context)).rejects.toThrow()
    expect(await findImpersonationSession(db, row.sessionId)).toBeNull()
    await expect(
      recordImpersonationRequest(db, row, { requestId: 'r', method: 'POST', path: '/tasks' }),
    ).rejects.toThrow()
  })

  it('deletes only the expected delegation and succeeds even if stop audit fails', async () => {
    const db = createMemoryD1()
    await startImpersonationSession(db, row, context)
    expect(
      await stopImpersonationSession(db, { sessionId: row.sessionId, expectedId: 'old' }, context),
    ).toBe(false)
    expect(await findImpersonationSession(db, row.sessionId)).toEqual(row)
    await db.run(sql`DROP TABLE audit_events`)
    expect(
      await stopImpersonationSession(db, { sessionId: row.sessionId, expectedId: row.id }, context),
    ).toBe(true)
    expect(await findImpersonationSession(db, row.sessionId)).toBeNull()
  })
})
