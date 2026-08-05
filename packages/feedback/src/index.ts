/**
 * @kit/feedback — SDK signalement → Pilotage (kit SSoT)
 *
 * - `./hono`   — proxy Worker → POST /api/v1/feedback
 * - `./react`  — bouton flottant + modal
 * - `./styles.css` — styles autonomes (CSS vars)
 */
export {
  DEFAULT_PILOTAGE_URL,
  FEEDBACK_DEFAULT_PRIORITY,
  FEEDBACK_DEFAULT_TYPE,
  FEEDBACK_MAX_IMAGE_BYTES,
  FEEDBACK_MAX_IMAGES,
  FEEDBACK_PRIORITIES,
  FEEDBACK_TYPES,
  PILOTAGE_FEEDBACK_PATH,
  PILOTAGE_UPLOAD_PATH,
} from './constants'
export type { FeedbackEnv } from './env'
export { isFeedbackEnabled, isTruthyEnvFlag, readPilotageEnv } from './env'

export {
  buildClientFormData,
  isFeedbackPriority,
  isFeedbackType,
  parseFeedbackFormData,
} from './form'
export type { ResolvePilotageConfigInput } from './remote-client'
export { resolvePilotageRemoteConfig, submitRemoteFeedback } from './remote-client'

export type {
  FeedbackFormFields,
  FeedbackPriority,
  FeedbackSubmitError,
  FeedbackSubmitResult,
  FeedbackSubmitSuccess,
  FeedbackType,
  PilotageRemoteConfig,
} from './types'
