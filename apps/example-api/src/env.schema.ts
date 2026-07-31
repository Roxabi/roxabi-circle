/**
 * Worker string-env SSoT (Zod).
 *
 * Bindings (DB, BUCKET) are Cloudflare resources — not in .dev.vars.
 * String keys must be documented in apps/example-api/.dev.vars.example.
 *
 * Runtime still uses fail-closed helpers (getSecret, etc.).
 * Inventory + env:check must use this module, not a freehand Env type.
 */
import { z } from 'zod'

/** D1 / R2 / Email / future resource bindings — wrangler only, never .dev.vars. */
export const WORKER_BINDINGS = ['DB', 'BUCKET', 'EMAIL'] as const
export type WorkerBindingName = (typeof WORKER_BINDINGS)[number]

/**
 * Secrets + plain vars available on `c.env` as strings.
 * All optional at the type level; production requirements live in getSecret / deploy.
 */
export const workerStringEnvSchema = z.object({
  /** Min 32 chars in prod; see getSecret(). */
  SESSION_SECRET: z.string().optional(),
  /** development | test | production | staging */
  ENVIRONMENT: z.string().optional(),
  /** Comma-separated browser origins for CORS + credentials. */
  CORS_ORIGINS: z.string().optional(),
  DEMO_USER_EMAIL: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  /** Override session cookie name (default gosilex_session). */
  SESSION_COOKIE_NAME: z.string().optional(),
  /** Better Auth secret (min 32) — required outside development|test. */
  BETTER_AUTH_SECRET: z.string().optional(),
  /** Public app URL for Better Auth baseURL (e.g. http://localhost:8787). */
  BETTER_AUTH_URL: z.string().optional(),
  /**
   * When `true`, Better Auth public email sign-up is enabled.
   * Default off (disableSignUp) — seed or admin-only create for kit.
   */
  ALLOW_PUBLIC_SIGNUP: z.string().optional(),
  /**
   * Email transport (ADR-0004): log | cf | resend.
   * development|test defaults to log when unset; staging|production must set cf|resend.
   */
  EMAIL_TRANSPORT: z.string().optional(),
  /** From address for cf/resend (must be onboarded domain for CF Email). */
  EMAIL_FROM: z.string().optional(),
  /** Optional display name for From. */
  EMAIL_FROM_NAME: z.string().optional(),
  /** Resend API key when EMAIL_TRANSPORT=resend (escape hatch). */
  RESEND_API_KEY: z.string().optional(),
})

export type WorkerStringEnv = z.infer<typeof workerStringEnvSchema>

/** Ordered keys for env:check / docs. */
export const WORKER_STRING_ENV_KEYS = Object.keys(
  workerStringEnvSchema.shape,
) as (keyof WorkerStringEnv)[]

/**
 * Soft-parse string env from a partial record (tests / tooling).
 * Does not enforce production fail-closed rules.
 */
export function parseWorkerStringEnv(input: Record<string, unknown>): WorkerStringEnv {
  return workerStringEnvSchema.parse(input)
}
