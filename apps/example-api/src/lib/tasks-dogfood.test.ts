import { describe, expect, it } from 'vitest'
import {
  COMMENTS_MODULE_ID,
  DEMO_TASK_STAGES,
  demoDefaultStageId,
  demoTaskCommentTarget,
  TASKS_MODULE_ID,
} from './tasks-dogfood'

describe('tasks-dogfood pure import', () => {
  it('exports module ids', () => {
    expect(TASKS_MODULE_ID).toBe('tasks')
    expect(COMMENTS_MODULE_ID).toBe('comments')
  })

  it('demo board has default stage', () => {
    expect(demoDefaultStageId()).toBe('demo-todo')
    expect(DEMO_TASK_STAGES).toHaveLength(3)
  })

  it('comment target for task', () => {
    expect(demoTaskCommentTarget('t1')).toEqual({
      targetType: 'task',
      targetId: 't1',
    })
  })
})
