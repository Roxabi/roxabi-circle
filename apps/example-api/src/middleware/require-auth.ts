import { AppError } from '@gosilex/core'
import { createDb } from '@gosilex/db'
import type { MiddlewareHandler } from 'hono'
import { schema } from '../db/schema'
import { getSecret } from '../lib/session-env'
import * as authService from '../services/auth'
import type { AppEnv } from '../types'

/**
 * Dual-path auth middleware: Bearer sk_ or session cookie → subject + authMethod.
 * Mount with `route.use('*', requireAuth)` so handlers cannot forget the guard.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const db = createDb(c.env.DB, schema)
  const auth = await authService.resolveAuth(
    db,
    getSecret(c.env),
    c.req.header('authorization') ?? null,
    c.req.header('cookie') ?? null,
  )
  if (!auth) throw AppError.unauthorized()
  c.set('subject', auth.subject)
  c.set('authMethod', auth.method)
  await next()
}
