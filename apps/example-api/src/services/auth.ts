import {
  apiKeyPrefix,
  defaultSessionPort,
  generateApiKey,
  hashApiKey,
  parseBearer,
  parseCookie,
  SESSION_COOKIE,
  type SessionPort,
  verifyApiKey,
  verifyPassword,
} from '@gosilex/auth'

// re-export crypto helpers used by tests
export { hashApiKey, verifyApiKey }

import { AppError } from '@gosilex/core'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { schema } from '../db/schema'
import * as keysRepo from '../repos/keys'
import * as usersRepo from '../repos/users'
import {
  DEMO_EMAIL,
  DEMO_EMAIL_B,
  DEMO_PASSWORD,
  DEMO_PASSWORD_B,
  type KitRole,
  roleForSubject,
} from '../seed/demo-data'
import { ensureDemoUsers } from '../seed/seed-db'

type Db = DrizzleD1Database<typeof schema>

export type { KitRole }
export { roleForSubject }

/** @deprecated prefer ensureDemoUsers from seed — kept name for call sites */
export async function ensureDemoUser(db: Db, opts?: { environment?: string | null }) {
  await ensureDemoUsers(db, opts)
}

export async function loginWithPassword(
  db: Db,
  secret: string,
  email: string,
  password: string,
  opts?: {
    secureCookie?: boolean
    environment?: string | null
    sessions?: SessionPort
  },
): Promise<{ cookie: string; subject: string }> {
  const sessions = opts?.sessions ?? defaultSessionPort
  await ensureDemoUsers(db, { environment: opts?.environment })
  const user = await usersRepo.findUserByEmail(db, email)
  if (!user) throw AppError.unauthorized('Invalid credentials')
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) throw AppError.unauthorized('Invalid credentials')
  const token = await sessions.sign(
    {
      sub: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    },
    secret,
  )
  return {
    subject: user.id,
    cookie: sessions.cookieHeader(token, { secure: opts?.secureCookie ?? false }),
  }
}

export function logoutCookie(opts?: { secureCookie?: boolean; sessions?: SessionPort }): string {
  const sessions = opts?.sessions ?? defaultSessionPort
  return sessions.clearCookieHeader({ secure: opts?.secureCookie ?? false })
}

export async function mintApiKey(
  db: Db,
  subject: string,
  opts?: { name?: string; expiresAt?: number | null; ttlMs?: number },
): Promise<{ id: string; key: string; keyPrefix: string }> {
  const key = generateApiKey()
  const keyHash = await hashApiKey(key)
  const keyPrefix = apiKeyPrefix(key)
  const id = crypto.randomUUID()
  const createdAt = Date.now()
  const expiresAt =
    opts?.expiresAt !== undefined ? opts.expiresAt : opts?.ttlMs ? createdAt + opts.ttlMs : null
  await keysRepo.insertApiKey(db, {
    id,
    keyHash,
    keyPrefix,
    subject,
    name: opts?.name ?? null,
    createdAt,
    expiresAt,
  })
  return { id, key, keyPrefix }
}

export async function listApiKeys(db: Db, subject: string) {
  return keysRepo.listApiKeysForSubject(db, subject)
}

export async function revokeApiKey(db: Db, id: string, subject: string): Promise<void> {
  const ok = await keysRepo.revokeApiKey(db, id, subject)
  if (!ok) throw AppError.notFound('API key not found')
}

export async function resolveAuth(
  db: Db,
  secret: string,
  authorization: string | null,
  cookieHeader: string | null,
  opts?: { sessions?: SessionPort },
): Promise<{ subject: string; method: 'session' | 'api_key' } | null> {
  const sessions = opts?.sessions ?? defaultSessionPort
  const bearer = parseBearer(authorization)
  if (bearer) {
    let prefix: string
    try {
      prefix = apiKeyPrefix(bearer)
    } catch {
      throw AppError.unauthorized()
    }
    const row = await keysRepo.findApiKeyByPrefix(db, prefix)
    if (!row || row.revokedAt != null) throw AppError.unauthorized()
    if (row.expiresAt != null && row.expiresAt <= Date.now()) throw AppError.unauthorized()
    const ok = await verifyApiKey(bearer, row.keyHash)
    if (!ok) throw AppError.unauthorized()
    return { subject: row.subject, method: 'api_key' }
  }

  const token = parseCookie(cookieHeader, SESSION_COOKIE)
  if (token) {
    const payload = await sessions.verify(token, secret)
    if (payload) return { subject: payload.sub, method: 'session' }
  }

  return null
}

export { DEMO_EMAIL, DEMO_EMAIL_B, DEMO_PASSWORD, DEMO_PASSWORD_B }
