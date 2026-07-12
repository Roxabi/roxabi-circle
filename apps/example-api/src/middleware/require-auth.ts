import { AppError } from '@gosilex/core'
import { createDb } from '@gosilex/db'
import type { Context } from 'hono'
import { schema } from '../db/schema'
import { getSecret } from '../lib/session-env'
import * as authService from '../services/auth'
import type { AppEnv } from '../types'

/** Dual-path auth: Bearer sk_ or session cookie → subject + authMethod. */
export async function requireAuth(c: Context<AppEnv>): Promise<void> {
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
}
