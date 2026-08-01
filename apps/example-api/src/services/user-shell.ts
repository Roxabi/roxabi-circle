/**
 * BA user shell helpers shared by admin provision and invite S3.
 */
import { normalizeEmail } from '@gosilex/auth'
import { AppError } from '@gosilex/core'
import { hashPassword } from 'better-auth/crypto'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { schema } from '../db/schema'
import * as usersRepo from '../repos/users'

type Db = DrizzleD1Database<typeof schema>

export const WELCOME_TTL_SEC = 3600

export function newUserId(): string {
  return `user_${crypto.randomUUID().replace(/-/g, '')}`
}

export function newMemberId(): string {
  return `mem_${crypto.randomUUID().replace(/-/g, '')}`
}

/** BA generateId(24)-style token. */
export function newWelcomeToken(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export function randomUnusablePassword(): string {
  return `x${crypto.randomUUID()}${crypto.randomUUID()}`
}

/**
 * Shell provision for S3 invite (no platform role). Does not send email — caller sends.
 * On email failure, caller must `deleteBaUserCascade`.
 */
export async function provisionUserShell(
  db: Db,
  input: { email: string; name?: string },
): Promise<{ userId: string; email: string; name: string; welcomeToken: string }> {
  const email = normalizeEmail(input.email)
  const existing = await usersRepo.findBaUserByEmail(db, email)
  if (existing) {
    throw AppError.conflict('User already exists')
  }
  const userId = newUserId()
  const name = (input.name?.trim() || email.split('@')[0] || 'User').slice(0, 120)
  const passwordHash = await hashPassword(randomUnusablePassword())
  const now = new Date()
  await usersRepo.insertBaUserWithCredential(db, {
    id: userId,
    email,
    name,
    passwordHash,
    emailVerified: true,
    now,
  })
  const welcomeToken = newWelcomeToken()
  await usersRepo.insertResetPasswordToken(db, {
    userId,
    token: welcomeToken,
    expiresAt: new Date(now.getTime() + WELCOME_TTL_SEC * 1000),
    now,
  })
  return { userId, email, name, welcomeToken }
}
