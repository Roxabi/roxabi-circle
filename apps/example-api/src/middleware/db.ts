import { createDb } from '@kit/db'
import type { MiddlewareHandler } from 'hono'
import { schema } from '../db/schema'
import type { AppEnv } from '../types'

/**
 * Request-scoped Drizzle handle — single createDb per request.
 * Routes and requireAuth read `c.get('db')` instead of reconstructing.
 */
export const withDb: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('db', createDb(c.env.DB, schema))
  await next()
}
