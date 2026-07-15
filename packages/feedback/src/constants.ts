/** Aligné sur Spark `FEEDBACK_MAX_*` / docs/feedback-api.md */
export const FEEDBACK_MAX_IMAGES = 4
export const FEEDBACK_MAX_IMAGE_BYTES = 6 * 1024 * 1024

export const FEEDBACK_DEFAULT_TYPE = 'bug' as const
export const FEEDBACK_DEFAULT_PRIORITY = 'p2' as const

export const FEEDBACK_TYPES = ['bug', 'feature'] as const
export const FEEDBACK_PRIORITIES = ['p1', 'p2', 'p3'] as const

/** Endpoints M2M Spark (relatifs à la base URL). */
export const SPARK_FEEDBACK_PATH = '/api/v1/feedback'
export const SPARK_UPLOAD_PATH = '/api/v1/tickets/upload'

/**
 * Default Spark base for kit local dev (`../spark` → `npm run dev` on :3939).
 * Override with SPARK_URL (e.g. https://spark-staging.gosilex.com).
 */
export const DEFAULT_SPARK_URL = 'http://localhost:3939'
