import { describe, expect, it } from 'vitest'
import { kitComments } from './drizzle-schema'
import { deleteByTarget, deleteComment, getComment, insertComment, listByTarget } from './repos'
import { createMemoryD1 } from './test/memory-d1'

const commentA = {
  id: 'c1',
  orgId: 'org-a',
  targetType: 'task',
  targetId: 't1',
  authorId: 'u1',
  body: 'hello',
  visibility: 'shared',
  createdAt: 2,
  updatedAt: 2,
} as const

const commentB = {
  id: 'c2',
  orgId: 'org-b',
  targetType: 'task',
  targetId: 't1',
  authorId: 'u2',
  body: 'other-org',
  visibility: 'internal',
  createdAt: 3,
  updatedAt: 3,
} as const

const commentC = {
  id: 'c3',
  orgId: 'org-a',
  targetType: 'note',
  targetId: 'n1',
  authorId: 'u1',
  body: 'note',
  visibility: 'shared',
  createdAt: 1,
  updatedAt: 1,
} as const

const commentD = {
  id: 'c4',
  orgId: 'org-a',
  targetType: 'task',
  targetId: 't1',
  authorId: 'u3',
  body: 'older',
  visibility: 'shared',
  createdAt: 1,
  updatedAt: 1,
} as const

describe('comments repos org predicates', () => {
  it('lists by target scoped to org and target', async () => {
    const db = createMemoryD1()
    await insertComment(db, { ...commentA })
    await insertComment(db, { ...commentB })
    await insertComment(db, { ...commentC })
    await insertComment(db, { ...commentD })

    expect(await listByTarget(db, 'org-a', 'task', 't1')).toEqual([
      expect.objectContaining({ id: 'c1', orgId: 'org-a', targetType: 'task' }),
      expect.objectContaining({ id: 'c4', orgId: 'org-a', targetType: 'task' }),
    ])
    expect(await listByTarget(db, 'org-b', 'task', 't1')).toEqual([
      expect.objectContaining({ id: 'c2', orgId: 'org-b' }),
    ])
    expect(await listByTarget(db, 'org-a', 'note', 'n1')).toEqual([
      expect.objectContaining({ id: 'c3', targetType: 'note' }),
    ])
    expect(await listByTarget(db, 'org-a', 'task', 'missing')).toEqual([])
    expect(await listByTarget(db, 'org-c', 'task', 't1')).toEqual([])
  })

  it('get/delete pass org id', async () => {
    const db = createMemoryD1()
    expect(await insertComment(db, { ...commentA })).toEqual(commentA)

    expect(await getComment(db, 'org-a', 'c1')).toMatchObject({
      id: 'c1',
      body: 'hello',
      orgId: 'org-a',
    })
    expect(await getComment(db, 'org-b', 'c1')).toBeNull()

    await deleteComment(db, 'org-b', 'c1')
    expect(await getComment(db, 'org-a', 'c1')).toMatchObject({ id: 'c1' })

    await deleteComment(db, 'org-a', 'c1')
    expect(await getComment(db, 'org-a', 'c1')).toBeNull()
  })

  it('deleteByTarget removes only the (org, type, id) target', async () => {
    const db = createMemoryD1()
    const sameIdOtherType = { ...commentC, id: 'c5', targetId: 't1' }
    const sameOrgOtherTask = { ...commentA, id: 'c6', targetId: 't2' }
    for (const row of [commentA, commentB, commentC, commentD, sameIdOtherType, sameOrgOtherTask]) {
      await insertComment(db, { ...row })
    }

    await deleteByTarget(db, 'org-a', 'task', 't1')

    const left = await db.select({ id: kitComments.id }).from(kitComments).all()
    // c1 and c4 are the target. Kept: c2 same id other org, c5 same id other type, c6 other task.
    expect(left.map((row) => row.id).sort()).toEqual(['c2', 'c3', 'c5', 'c6'])
  })
})
