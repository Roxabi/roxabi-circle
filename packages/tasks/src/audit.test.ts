import { describe, expect, it } from 'vitest'
import { TASK_AUDIT_ACTIONS, taskMutationAudit } from './audit'

describe('taskMutationAudit', () => {
  it('maps each kind and drops title, description, and prototype keys', () => {
    const row = taskMutationAudit({
      kind: 'update',
      orgId: 'org_1',
      taskId: 'task_1',
      actorId: 'user_1',
      meta: {
        boardKey: 'main',
        stageId: 'st_1',
        title: 'ghp_live_example',
        description: 'reset me',
        externalUrl: 'https://example.test/hook',
        constructor: 'nope',
        __proto__: 'nope',
      },
    })
    expect(row).toEqual({
      action: TASK_AUDIT_ACTIONS.update,
      actorUserId: 'user_1',
      targetType: 'task',
      targetId: 'task_1',
      orgId: 'org_1',
      meta: { boardKey: 'main', stageId: 'st_1' },
    })
  })

  it('omits meta when nothing allowlisted is present', () => {
    const row = taskMutationAudit({
      kind: 'delete',
      orgId: 'org_1',
      taskId: 'task_1',
      actorId: 'user_1',
      meta: { title: 'gone' },
    })
    expect(row.action).toBe('task.delete')
    expect(row.meta).toBeUndefined()
    expect(row.targetId).toBe('task_1')
  })

  it('treats a link mutation as a task_link target', () => {
    const row = taskMutationAudit({
      kind: 'link_create',
      orgId: 'org_1',
      taskId: 'link_1',
      actorId: 'user_1',
      meta: { linkKind: 'blocks' },
    })
    expect(row.targetType).toBe('task_link')
    expect(row.action).toBe('task.link_create')
    expect(row.meta).toEqual({ linkKind: 'blocks' })
  })
})
