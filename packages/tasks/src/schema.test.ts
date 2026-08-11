import { describe, expect, it } from 'vitest'
import { parseCreateTaskInput, parseTask, parseTaskLink, parseTaskStage } from './schema'

describe('parseTask / create', () => {
  const base = {
    id: 't1',
    orgId: 'o1',
    title: 'Hello',
    boardKey: 'main',
    stageId: 's1',
    visibility: 'shared' as const,
    done: false,
    createdBy: 'u1',
    assigneeIds: [] as string[],
  }

  it('accepts minimal task', () => {
    const r = parseTask(base)
    expect(r.success).toBe(true)
  })

  it('requires scope pair', () => {
    const r = parseTask({ ...base, scopeKind: 'project' })
    expect(r.success).toBe(false)
  })

  it('accepts scope pair', () => {
    const r = parseTask({ ...base, scopeKind: 'project', scopeId: 'p1' })
    expect(r.success).toBe(true)
  })

  it('rejects bad board_key', () => {
    const r = parseCreateTaskInput({
      orgId: 'o1',
      title: 'x',
      boardKey: 'Main Board',
      createdBy: 'u1',
    })
    expect(r.success).toBe(false)
  })

  it('defaults visibility shared', () => {
    const r = parseCreateTaskInput({
      orgId: 'o1',
      title: 'x',
      boardKey: 'main',
      createdBy: 'u1',
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.visibility).toBe('shared')
  })
})

describe('parseTaskStage', () => {
  it('ok', () => {
    const r = parseTaskStage({
      id: 's1',
      orgId: 'o1',
      boardKey: 'main',
      label: 'Todo',
      position: 0,
      isDefault: true,
      isTerminal: false,
    })
    expect(r.success).toBe(true)
  })
})

describe('parseTaskLink', () => {
  it('rejects self link', () => {
    const r = parseTaskLink({
      id: 'l1',
      orgId: 'o1',
      fromTaskId: 'a',
      toTaskId: 'a',
      kind: 'parent',
    })
    expect(r.success).toBe(false)
  })
})
