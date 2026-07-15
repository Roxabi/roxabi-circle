/**
 * @gosilex/feedback — SDK signalement → Spark Pilotage (kit SSoT)
 *
 * - `./hono`   — proxy Worker → POST /api/v1/feedback
 * - `./react`  — bouton flottant + modal
 * - `./styles.css` — styles autonomes (CSS vars)
 */
export {
  DEFAULT_SPARK_URL,
  FEEDBACK_DEFAULT_PRIORITY,
  FEEDBACK_DEFAULT_TYPE,
  FEEDBACK_MAX_IMAGE_BYTES,
  FEEDBACK_MAX_IMAGES,
  FEEDBACK_PRIORITIES,
  FEEDBACK_TYPES,
  SPARK_FEEDBACK_PATH,
  SPARK_UPLOAD_PATH,
} from './constants'
export type { FeedbackEnv } from './env'
export { isFeedbackEnabled, readSparkEnv } from './env'

export {
  buildClientFormData,
  isFeedbackPriority,
  isFeedbackType,
  parseFeedbackFormData,
} from './form'
export type { ResolveSparkConfigInput } from './remote-client'
export { resolveSparkRemoteConfig, submitRemoteFeedback } from './remote-client'

export type {
  FeedbackFormFields,
  FeedbackPriority,
  FeedbackSubmitError,
  FeedbackSubmitResult,
  FeedbackSubmitSuccess,
  FeedbackType,
  SparkRemoteConfig,
} from './types'
