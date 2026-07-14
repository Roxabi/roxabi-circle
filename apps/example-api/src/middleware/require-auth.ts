import { createRequireAuth, defaultSessionPort } from '@gosilex/auth'
import { AppError } from '@gosilex/core'
import type { MiddlewareHandler } from 'hono'
import type { KitDb } from '../lib/db-type'
import { getSecret } from '../lib/session-env'
import * as keysRepo from '../repos/keys'
import type { AppEnv } from '../types'

function dbFromContext(c: { get: (k: 'db') => KitDb | undefined }): KitDb {
  const existing = c.get('db')
  if (!existing) {
    throw AppError.internal('db not bound — withDb middleware required')
  }
  return existing
}

/**
 * Dual-path auth middleware: Bearer sk_ or session cookie → subject + authMethod.
 * Package factory + app-injected D1 key lookup + session secret.
 * Requires request-scoped `c.get('db')` from withDb (fail-closed if missing).
 */
export const requireAuth: MiddlewareHandler<AppEnv> = createRequireAuth((c) => {
  const db = dbFromContext(c as { get: (k: 'db') => KitDb | undefined })
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
