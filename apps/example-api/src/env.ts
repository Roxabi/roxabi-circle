import type { WorkerStringEnv } from './env.schema'

/**
 * Cloudflare Worker bindings + string env.
 * String keys SSoT: `./env.schema.ts` (Zod). Do not add string keys here only.
 */
export type Env = WorkerStringEnv & {
  DB: D1Database
  BUCKET: R2Bucket
}

export {
  parseWorkerStringEnv,
  WORKER_BINDINGS,
  WORKER_STRING_ENV_KEYS,
  type WorkerBindingName,
  type WorkerStringEnv,
  workerStringEnvSchema,
} from './env.schema'
