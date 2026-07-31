import type { WorkerStringEnv } from './env.schema'

/**
 * Minimal CF Email Sending binding (ADR-0004). Full types from `wrangler types` when available.
 */
export type SendEmailBinding = {
  send: (msg: {
    to: string | string[]
    from: string | { email: string; name?: string }
    subject: string
    text?: string
    html?: string
  }) => Promise<{ messageId?: string } | void>
}

/**
 * Cloudflare Worker bindings + string env.
 * String keys SSoT: `./env.schema.ts` (Zod). Do not add string keys here only.
 */
export type Env = WorkerStringEnv & {
  DB: D1Database
  BUCKET: R2Bucket
  /** Optional send_email binding — required when EMAIL_TRANSPORT=cf. */
  EMAIL?: SendEmailBinding
}

export {
  parseWorkerStringEnv,
  WORKER_BINDINGS,
  WORKER_STRING_ENV_KEYS,
  type WorkerBindingName,
  type WorkerStringEnv,
  workerStringEnvSchema,
} from './env.schema'
