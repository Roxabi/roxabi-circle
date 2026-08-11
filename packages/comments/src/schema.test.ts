import { describe, expect, it } from 'vitest'
import { parseComment, parseCommentTarget, parseCreateCommentInput } from './schema'
import { filterByTarget, taskCommentTarget } from './target'
import { canViewComment, filterCommentsForAudience } from './visibility'

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
})
