/** Optional module id if products gate comments separately. Often co-enabled with tasks. */
export const COMMENTS_MODULE_ID = 'comments' as const

export const COMMENTS_VERSION = 1 as const

/**
 * Well-known target types (open string at parse — product may add more).
 * `task` is the primary compose with @kit/tasks.
 */
export const KNOWN_COMMENT_TARGET_TYPES = [
  'task',
  'project',
  'phase',
  'organization',
  'contract',
  'document',
  'note',
] as const

export type KnownCommentTargetType = (typeof KNOWN_COMMENT_TARGET_TYPES)[number]

/** Same visibility model as tasks — external never sees internal comments. */
export {
  KIT_VISIBILITIES as COMMENT_VISIBILITIES,
  type KitVisibility as CommentVisibility,
} from '@kit/types'

export const MAX_COMMENT_BODY_LEN = 20_000
export const MAX_TARGET_TYPE_LEN = 64
