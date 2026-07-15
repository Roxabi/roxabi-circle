import {
  createBetterAuthSessionPort,
  createHmacSessionPort,
  createRequireAuth,
} from '@gosilex/auth'
import { AppError } from '@gosilex/core'
import type { MiddlewareHandler } from 'hono'
import type { KitDb } from '../lib/db-type'
import { authSessionAdapter, getSecret, sessionCookieName } from '../lib/session-env'
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
 * Session path uses HMAC or Better Auth SessionPort based on AUTH_SESSION_ADAPTER.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = createRequireAuth((c) => {
  const db = dbFromContext(c as { get: (k: 'db') => KitDb | undefined })
  const adapter = authSessionAdapter(c.env)
  const cookieName = sessionCookieName(c.env)

  if (adapter === 'better-auth') {
    const auth = c.get('betterAuth')
    if (!auth) {
      throw AppError.internal('betterAuth not bound — withBetterAuth middleware required')
    }
    return {
      cookieName,
      sessions: createBetterAuthSessionPort({
        cookieName,
        getAuth: () => auth,
      }),
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
  }

  return {
    secret: getSecret(c.env),
    cookieName,
    sessions: createHmacSessionPort(),
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
