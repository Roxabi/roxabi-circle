/**
 * @kit/comments — multi-target comment rail (ADR-0007).
 * Pure package: no Worker bindings.
 * Attach to tasks via targetType="task", or product entities (project, contract, …).
 */

export type { Audience } from './audience'
export { AUDIENCES, isAudience } from './audience'

export {
  COMMENT_VISIBILITIES,
  COMMENTS_MODULE_ID,
  COMMENTS_VERSION,
  type CommentVisibility,
  KNOWN_COMMENT_TARGET_TYPES,
  type KnownCommentTargetType,
  MAX_COMMENT_BODY_LEN,
  MAX_TARGET_TYPE_LEN,
} from './constants'

export {
  type Comment,
  type CommentTarget,
  type CreateCommentInput,
  commentSchema,
  commentTargetSchema,
  createCommentInputSchema,
  parseComment,
  parseCommentTarget,
  parseCreateCommentInput,
  parseUpdateCommentInput,
  type UpdateCommentInput,
  updateCommentInputSchema,
} from './schema'

export {
  filterByTarget,
  matchesTarget,
  targetKey,
  taskCommentTarget,
} from './target'

export {
  canSetCommentVisibility,
  canViewComment,
  filterCommentsForAudience,
  type VisibilitySubject,
} from './visibility'
