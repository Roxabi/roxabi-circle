/**
 * Pure-package smoke import for @kit/tasks / @kit/comments (ADR-0007 incubating).
 * Full D1 + HTTP dogfood is a later tranche — keep this module free of bindings.
 */
import { COMMENTS_MODULE_ID, taskCommentTarget } from '@kit/comments'
import { checkBoardStages, findDefaultStage, TASKS_MODULE_ID, type TaskStage } from '@kit/tasks'

export { COMMENTS_MODULE_ID, TASKS_MODULE_ID }

/** Demo board catalogue used only in unit tests / future seed. */
export const DEMO_TASK_STAGES: TaskStage[] = [
  {
    id: 'demo-todo',
    orgId: 'demo-org',
    boardKey: 'main',
    label: 'Todo',
    position: 0,
    isDefault: true,
    isTerminal: false,
  },
  {
    id: 'demo-doing',
    orgId: 'demo-org',
    boardKey: 'main',
    label: 'Doing',
    position: 1,
    isDefault: false,
    isTerminal: false,
  },
  {
    id: 'demo-done',
    orgId: 'demo-org',
    boardKey: 'main',
    label: 'Done',
    position: 2,
    isDefault: false,
    isTerminal: true,
  },
]

export function demoDefaultStageId(): string {
  const issues = checkBoardStages(DEMO_TASK_STAGES, 'demo-org', 'main')
  if (issues.length > 0) {
    throw new Error(issues.map((i) => i.message).join('; '))
  }
  const stage = findDefaultStage(DEMO_TASK_STAGES, 'demo-org', 'main')
  if (!stage) throw new Error('missing default stage')
  return stage.id
}

export function demoTaskCommentTarget(taskId: string) {
  return taskCommentTarget(taskId)
}
