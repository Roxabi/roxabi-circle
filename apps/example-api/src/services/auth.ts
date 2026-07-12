import {
  clearSessionCookieHeader,
  generateApiKey,
  hashApiKey,
  parseBearer,
  parseCookie,
  SESSION_COOKIE,
  sessionCookieHeader,
  signSession,
  verifyApiKey,
  verifyPassword,
  verifySession,
} from '@gosilex/auth'

// re-export crypto helpers used by tests
export { hashApiKey, verifyApiKey }

import { AppError } from '@gosilex/core'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { schema } from '../db/schema'
import * as keysRepo from '../repos/keys'
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
  opts?: { secureCookie?: boolean; environment?: string | null },
): Promise<{ cookie: string; subject: string }> {
  await ensureDemoUsers(db, { environment: opts?.environment })
  const { demoUsers } = await import('../db/schema')
  const { eq } = await import('drizzle-orm')
  const rows = await db.select().from(demoUsers).where(eq(demoUsers.email, email)).all()
  const user = rows[0]
  if (!user) throw AppError.unauthorized('Invalid credentials')
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) throw AppError.unauthorized('Invalid credentials')
  const token = await signSession(
    {
      sub: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    },
    secret,
  )
  return {
    subject: user.id,
    cookie: sessionCookieHeader(token, { secure: opts?.secureCookie ?? false }),
  }
}

export function logoutCookie(opts?: { secureCookie?: boolean }): string {
  return clearSessionCookieHeader({ secure: opts?.secureCookie ?? false })
}

export async function mintApiKey(db: Db, subject: string): Promise<{ id: string; key: string }> {
  const key = generateApiKey()
  const keyHash = await hashApiKey(key)
  const id = crypto.randomUUID()
  await keysRepo.insertApiKey(db, {
    id,
    keyHash,
    subject,
    createdAt: Date.now(),
  })
  return { id, key }
}

export async function resolveAuth(
  db: Db,
  secret: string,
  authorization: string | null,
  cookieHeader: string | null,
): Promise<{ subject: string; method: 'session' | 'api_key' } | null> {
  const bearer = parseBearer(authorization)
  if (bearer) {
    const h = await hashApiKey(bearer)
    const row = await keysRepo.findApiKeyByHash(db, h)
    if (row) return { subject: row.subject, method: 'api_key' }
    throw AppError.unauthorized()
  }

  const token = parseCookie(cookieHeader, SESSION_COOKIE)
  if (token) {
    const payload = await verifySession(token, secret)
    if (payload) return { subject: payload.sub, method: 'session' }
  }

  return null
}

export { DEMO_EMAIL, DEMO_EMAIL_B, DEMO_PASSWORD, DEMO_PASSWORD_B }
