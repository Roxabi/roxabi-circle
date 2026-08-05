/** Aligné sur Pilotage `FEEDBACK_MAX_*` / docs/feedback-api.md */
export const FEEDBACK_MAX_IMAGES = 4
export const FEEDBACK_MAX_IMAGE_BYTES = 6 * 1024 * 1024

export const FEEDBACK_DEFAULT_TYPE = 'bug' as const
export const FEEDBACK_DEFAULT_PRIORITY = 'p2' as const

export const FEEDBACK_TYPES = ['bug', 'feature'] as const
export const FEEDBACK_PRIORITIES = ['p1', 'p2', 'p3'] as const

/** Endpoints M2M Pilotage (relatifs à la base URL). */
export const PILOTAGE_FEEDBACK_PATH = '/api/v1/feedback'
export const PILOTAGE_UPLOAD_PATH = '/api/v1/tickets/upload'

/**
 * Default Pilotage base for kit local dev (`../pilotage` → `npm run dev` on :3939).
 * Override with PILOTAGE_URL (e.g. https://pilotage-staging.example.com).
 */
export const DEFAULT_PILOTAGE_URL = 'http://localhost:3939'
