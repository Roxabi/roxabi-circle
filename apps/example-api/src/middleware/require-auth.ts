import { createRequireAuth, defaultSessionPort } from '@gosilex/auth'
import { createDb } from '@gosilex/db'
import type { MiddlewareHandler } from 'hono'
import { schema } from '../db/schema'
import type { KitDb } from '../lib/db-type'
import { getSecret } from '../lib/session-env'
import * as keysRepo from '../repos/keys'
import type { AppEnv } from '../types'

function dbFromContext(c: { get: (k: 'db') => unknown; env: AppEnv['Bindings'] }): KitDb {
  const existing = c.get('db') as KitDb | undefined
  if (existing) return existing
  return createDb(c.env.DB, schema) as KitDb
}

/**
 * Dual-path auth middleware: Bearer sk_ or session cookie → subject + authMethod.
 * Package factory + app-injected D1 key lookup + session secret.
 * Prefers request-scoped `c.get('db')` from withDb middleware.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = createRequireAuth((c) => {
  const db = dbFromContext(c as { get: (k: 'db') => unknown; env: AppEnv['Bindings'] })
  return {
    secret: getSecret(c.env),
    sessions: defaultSessionPort,
    findApiKeyByPrefix: async (prefix) => {
      const row = await keysRepo.findApiKeyByPrefix(db, prefix)
      if (!row) return null
      return {
        subject: row.subject,
        keyHash: row.keyHash,
        revokedAt: row.revokedAt ?? null,
        expiresAt: row.expiresAt ?? null,
      }
    },
  }
}) as MiddlewareHandler<AppEnv>
