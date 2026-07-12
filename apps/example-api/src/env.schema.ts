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

/** D1 / R2 / future resource bindings — wrangler only, never .dev.vars. */
export const WORKER_BINDINGS = ['DB', 'BUCKET'] as const
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
