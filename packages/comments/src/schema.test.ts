import { describe, expect, it } from 'vitest'
import { isAudience } from './audience'
import {
  parseComment,
  parseCommentTarget,
  parseCreateCommentInput,
  parseUpdateCommentInput,
} from './schema'
import { filterByTarget, matchesTarget, targetKey, taskCommentTarget } from './target'
import { canSetCommentVisibility, canViewComment, filterCommentsForAudience } from './visibility'

describe('comment schema', () => {
  it('parses comment', () => {
    const r = parseComment({
      id: 'c1',
      orgId: 'o1',
      targetType: 'task',
      targetId: 't1',
      authorId: 'u1',
      body: 'hello',
      visibility: 'shared',
    })
    expect(r.success).toBe(true)
  })

  it('rejects empty body', () => {
    const r = parseCreateCommentInput({
      orgId: 'o1',
      targetType: 'task',
      targetId: 't1',
      authorId: 'u1',
      body: '',
    })
    expect(r.success).toBe(false)
  })

  it('defaults visibility shared', () => {
    const r = parseCreateCommentInput({
      orgId: 'o1',
      targetType: 'project',
      targetId: 'p1',
      authorId: 'u1',
      body: 'note',
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.visibility).toBe('shared')
  })

  it('target type slug', () => {
    expect(parseCommentTarget({ targetType: 'Task', targetId: 'x' }).success).toBe(false)
    expect(parseCommentTarget({ targetType: 'task', targetId: 'x' }).success).toBe(true)
  })
})

describe('target helpers', () => {
  it('taskCommentTarget', () => {
    expect(taskCommentTarget('t9')).toEqual({ targetType: 'task', targetId: 't9' })
  })

  it('filterByTarget', () => {
    const rows = [
      { id: 1, targetType: 'task', targetId: 't1' },
      { id: 2, targetType: 'task', targetId: 't2' },
      { id: 3, targetType: 'project', targetId: 't1' },
    ]
    expect(filterByTarget(rows, { targetType: 'task', targetId: 't1' }).map((r) => r.id)).toEqual([
      1,
    ])
  })
})

describe('visibility', () => {
  it('external hides internal', () => {
    expect(canViewComment({ visibility: 'internal' }, 'external')).toBe(false)
    expect(
      filterCommentsForAudience(
        [{ visibility: 'internal' as const }, { visibility: 'shared' as const }],
        'external',
      ),
    ).toHaveLength(1)
  })

  it('staff sees all and can set internal', () => {
    expect(canViewComment({ visibility: 'internal' }, 'staff')).toBe(true)
    expect(filterCommentsForAudience([{ visibility: 'internal' as const }], 'staff')).toHaveLength(
      1,
    )
    expect(canSetCommentVisibility('staff', 'internal')).toBe(true)
    expect(canSetCommentVisibility('external', 'internal')).toBe(false)
    expect(canSetCommentVisibility('external', 'shared')).toBe(true)
  })
})

describe('parse update + audience helpers', () => {
  it('parseUpdateCommentInput', () => {
    expect(parseUpdateCommentInput({ body: 'x' }).success).toBe(true)
    expect(parseUpdateCommentInput({ body: '' }).success).toBe(false)
  })

  it('isAudience', () => {
    expect(isAudience('staff')).toBe(true)
    expect(isAudience('nope')).toBe(false)
  })

  it('targetKey + matchesTarget negative', () => {
    expect(targetKey({ targetType: 'task', targetId: 't1' })).toBe('task:t1')
    expect(
      matchesTarget({ targetType: 'task', targetId: 't1' }, { targetType: 'note', targetId: 't1' }),
    ).toBe(false)
  })
})
