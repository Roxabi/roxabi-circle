/**
 * @kit/tasks — work items: stages, visibility, links, opaque scope (ADR-0007).
 * Pure package: no Worker bindings. Apps wire D1 + auth + AudiencePort.
 *
 * **Incubating** — promote when example dogfood is green + first product compose.
 * Resource links: deferred until kit/product resource system exists.
 */

/** @deprecated Prefer `requireModule` / org grants in apps — pure role matrix only (tests / legacy). */
export {
  canAdminTaskBoards,
  canReadTasks,
  canWriteTasks,
  isTasksAdminRole,
  TASKS_ADMIN_ROLES,
  type TasksAdminRole,
} from './access'
export type { Audience, AudiencePort } from './audience'
export { AUDIENCES, isAudience } from './audience'

export {
  MAX_ASSIGNEES,
  MAX_BOARD_KEY_LEN,
  MAX_LINK_TRAVERSAL,
  MAX_SCOPE_ID_LEN,
  MAX_SCOPE_KIND_LEN,
  MAX_STAGE_LABEL_LEN,
  MAX_TASK_DESCRIPTION_LEN,
  MAX_TASK_TITLE_LEN,
  TASK_LINK_KINDS,
  TASK_PRIORITIES,
  TASK_VISIBILITIES,
  TASKS_MODULE_ID,
  TASKS_VERSION,
  type TaskLinkKind,
  type TaskPriority,
  type TaskVisibility,
} from './constants'

export type {
  TaskMutationEvent,
  TaskMutationHooks,
  TaskMutationKind,
} from './hooks'
export { runTaskMutationHook } from './hooks'

export {
  blockedTaskIds,
  checkNewLink,
  childTaskIds,
  type LinkEdge,
  type LinkIssue,
  type LinkIssueCode,
} from './links'

export {
  type CreateTaskInput,
  type CreateTaskLinkInput,
  createTaskInputSchema,
  createTaskLinkInputSchema,
  parseCreateTaskInput,
  parseCreateTaskLinkInput,
  parseTask,
  parseTaskLink,
  parseTaskStage,
  parseUpdateTaskInput,
  type Task,
  type TaskLink,
  type TaskStage,
  taskLinkSchema,
  taskSchema,
  taskStageSchema,
  type UpdateTaskInput,
  updateTaskInputSchema,
} from './schema'

export {
  filterByScope,
  hasScope,
  matchesScopeFilter,
  normalizeScope,
  type Scoped,
  type ScopeRef,
  scopeEquals,
} from './scope'

export {
  checkBoardStages,
  findDefaultStage,
  isStageOnBoard,
  isTerminalStage,
  type StageIssue,
  type StageIssueCode,
  stagesForBoard,
  suggestedDoneForStage,
} from './stages'

export {
  canSetVisibility,
  canViewTask,
  filterTasksForAudience,
  type VisibilitySubject,
} from './visibility'
