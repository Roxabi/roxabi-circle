import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'

/**
 * Historical name: org/RBAC surfaces required BA adapter.
 * ADR-0002 BA-only — always continues (middleware kept for stable import paths).
 */
export const requireBaAdapter: MiddlewareHandler<AppEnv> = async (_c, next) => {
  await next()
}
