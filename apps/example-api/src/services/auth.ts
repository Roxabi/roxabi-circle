import {
  generateApiKey,
  hashApiKey,
  hashPassword,
  parseBearer,
  parseCookie,
  SESSION_COOKIE,
  sessionCookieHeader,
  signSession,
  verifyApiKey,
  verifyPassword,
  verifySession,
} from '@gosilex/auth'
import { AppError } from '@gosilex/core'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { schema } from '../db/schema'
import * as keysRepo from '../repos/keys'

type Db = DrizzleD1Database<typeof schema>

const DEMO_PASSWORD = 'demo-password-change-me'
const DEMO_EMAIL = 'demo@gosilex.local'

export async function ensureDemoUser(db: Db) {
  const { demoUsers } = await import('../db/schema')
  const existing = await db.select().from(demoUsers).all()
  if (existing.length > 0) return
  await db
    .insert(demoUsers)
    .values({
      id: 'user_demo',
      email: DEMO_EMAIL,
      passwordHash: await hashPassword(DEMO_PASSWORD),
      createdAt: Date.now(),
    })
    .run()
}

export async function loginWithPassword(
  db: Db,
  secret: string,
  email: string,
  password: string,
  opts?: { secureCookie?: boolean },
): Promise<{ cookie: string; subject: string }> {
  await ensureDemoUser(db)
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

export { DEMO_EMAIL, DEMO_PASSWORD, hashApiKey, verifyApiKey }
