import { AppError } from '@gosilex/core'
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'
import { authSessionAdapter } from './session-env'

/** Org/RBAC surfaces require Better Auth session adapter (ADR-0003). */
export const requireBaAdapter: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (authSessionAdapter(c.env) !== 'better-auth') {
    throw AppError.notFound('Organization APIs require AUTH_SESSION_ADAPTER=better-auth')
  }
  await next()
}
