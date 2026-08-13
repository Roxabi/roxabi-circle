/** Platform module id (ADR-0003 catalogue). Product UI labels may say « Tâches ». */
export const TASKS_MODULE_ID = 'tasks' as const

export const TASKS_VERSION = 1 as const

/** Visibility: staff audience sees both; external sees `shared` only. */
export const TASK_VISIBILITIES = ['internal', 'shared'] as const
export type TaskVisibility = (typeof TASK_VISIBILITIES)[number]

/** Inter-task edge kinds (ADR-0007). Product may ignore `duplicates` until needed. */
export const TASK_LINK_KINDS = ['parent', 'blocks', 'duplicates'] as const
export type TaskLinkKind = (typeof TASK_LINK_KINDS)[number]

/** Priority optional scale — product may map other scales via custom fields outside kit. */
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const MAX_TASK_TITLE_LEN = 500
export const MAX_TASK_DESCRIPTION_LEN = 20_000
export const MAX_BOARD_KEY_LEN = 64
export const MAX_SCOPE_KIND_LEN = 64
export const MAX_SCOPE_ID_LEN = 256
export const MAX_STAGE_LABEL_LEN = 128
export const MAX_ASSIGNEES = 50
export const MAX_LINK_TRAVERSAL = 256
