import { AppError } from '@kit/core'
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'

/** Fail-closed: session cookie only — missing or `api_key` is 403. */
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('authMethod') !== 'session') {
    throw AppError.forbidden('This route requires a session cookie')
  }
  await next()
}
