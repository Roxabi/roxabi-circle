export type FeedbackEnvSlice = {
  FEEDBACK_ENABLED?: string
  SPARK_URL?: string
  SPARK_FEEDBACK_API_URL?: string
  SPARK_API_KEY?: string
  SPARK_FEEDBACK_API_KEY?: string
}

/** Worker / Vitest env keys for feedback (subset of app Bindings). */
export type FeedbackEnv = FeedbackEnvSlice

const TRUTHY = new Set(['true', '1', 'yes', 'on'])

/** Kill-switch / feature gate (Worker string env). Off by default in kit. */
export function isFeedbackEnabled(env: FeedbackEnvSlice): boolean {
  const v = (env.FEEDBACK_ENABLED ?? '').trim().toLowerCase()
  return TRUTHY.has(v)
}

export function readSparkEnv(source: FeedbackEnvSlice): {
  baseUrl?: string
  apiKey: string
} {
  const baseUrl = source.SPARK_URL?.trim() || source.SPARK_FEEDBACK_API_URL?.trim()
  const apiKey = source.SPARK_API_KEY?.trim() || source.SPARK_FEEDBACK_API_KEY?.trim() || ''
  return { baseUrl, apiKey }
}

/** Node/Vitest fallback when `env` override is omitted. */
export function readNodeProcessEnv(): FeedbackEnvSlice {
  const proc = (globalThis as { process?: { env?: FeedbackEnvSlice } }).process
  return proc?.env ?? {}
}
