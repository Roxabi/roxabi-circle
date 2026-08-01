import {
  isInvitableOrgRole,
  isPlatformRole,
  normalizeEmail,
  type PlatformRole,
} from '@gosilex/auth'
import { AppError } from '@gosilex/core'
import { buildWelcomeSetPasswordEmailText, type EmailPort } from '@gosilex/email'
import { hashPassword } from 'better-auth/crypto'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { schema } from '../db/schema'
import { assertRateLimit } from '../lib/rate-limit'
import * as orgsRepo from '../repos/orgs'
import * as platformRolesRepo from '../repos/platform-roles'
import * as usersRepo from '../repos/users'
import * as orgRolesService from './org-roles'
import {
  newMemberId,
  newUserId,
  newWelcomeToken,
  provisionUserShell,
  randomUnusablePassword,
  WELCOME_TTL_SEC,
} from './user-shell'

export { provisionUserShell }

type Db = DrizzleD1Database<typeof schema>

const CREATE_LIMIT = 20
const CREATE_WINDOW_MS = 60 * 60 * 1000
const RESEND_LIMIT = 10
const RESEND_WINDOW_MS = 60 * 60 * 1000

export type MembershipInput = { orgId: string; role: string }

export type CreateAdminUserInput = {
  actorUserId: string
  actorPlatformRole: PlatformRole
  email: string
  name?: string
  platformRole?: PlatformRole | null
  memberships?: MembershipInput[]
  sendEmail?: boolean
  /** SPA origin for set-password link (e.g. http://localhost:5173). */
  webBaseUrl: string
  emailPort: EmailPort
  /** Optional path after set-password (safe relative only). */
  afterSetPasswordPath?: string
}

/**
 * Create BA user (no clear password), optional platform role + memberships, welcome token + email.
 * Email is sent last; failure compensates by cascade-deleting the new user.
 */
export async function createAdminUser(db: Db, input: CreateAdminUserInput) {
  assertRateLimit(`admin-user-create:${input.actorUserId}`, CREATE_LIMIT, CREATE_WINDOW_MS)

  if (input.actorPlatformRole !== 'super_admin' && input.actorPlatformRole !== 'staff') {
    throw AppError.forbidden('Platform role required')
  }

  const email = normalizeEmail(input.email)
  if (!email?.includes('@')) {
    throw AppError.validation('Invalid email', { email: ['Valid email required'] })
  }

  const existing = await usersRepo.findBaUserByEmail(db, email)
  if (existing) {
    throw AppError.conflict('User already exists')
  }

  // Ceiling: only super_admin may assign staff|super_admin
  let platformRole: PlatformRole | null = null
  if (input.platformRole != null && input.platformRole !== undefined) {
    if (!isPlatformRole(input.platformRole)) {
      throw AppError.validation('Invalid platformRole')
    }
    if (input.actorPlatformRole !== 'super_admin') {
      throw AppError.forbidden('Only super_admin may assign platform roles')
    }
    platformRole = input.platformRole
  }

  const memberships = input.memberships ?? []
  const actorMemberships =
    input.actorPlatformRole === 'staff'
      ? await orgsRepo.listMembershipsForUser(db, input.actorUserId)
      : []
  const actorOrgIds = new Set(actorMemberships.map((m) => m.organizationId))

  for (const m of memberships) {
    const org = await orgsRepo.findOrgById(db, m.orgId)
    if (org?.status !== 'active') {
      throw AppError.notFound('Organization not found')
    }
    if (input.actorPlatformRole === 'staff' && !actorOrgIds.has(m.orgId)) {
      throw AppError.notFound('Organization not found')
    }
    if (!isInvitableOrgRole(m.role)) {
      const inviterRole =
        input.actorPlatformRole === 'super_admin'
          ? 'owner'
          : (actorMemberships.find((x) => x.organizationId === m.orgId)?.role ?? 'member')
      await orgRolesService.assertAssignableRole(db, m.orgId, m.role, inviterRole)
    } else if (input.actorPlatformRole === 'staff') {
      const inviterRole = actorMemberships.find((x) => x.organizationId === m.orgId)?.role ?? ''
      await orgRolesService.assertAssignableRole(db, m.orgId, m.role, inviterRole)
    }
  }

  const userId = newUserId()
  const name = (input.name?.trim() || email.split('@')[0] || 'User').slice(0, 120)
  const passwordHash = await hashPassword(randomUnusablePassword())
  const now = new Date()
  const sendEmail = input.sendEmail !== false

  await usersRepo.insertBaUserWithCredential(db, {
    id: userId,
    email,
    name,
    passwordHash,
    emailVerified: true,
    now,
  })

  if (platformRole) {
    await platformRolesRepo.setPlatformRole(db, userId, platformRole, now.getTime())
  }

  const createdMemberships: { organizationId: string; role: string }[] = []
  for (const m of memberships) {
    await orgsRepo.insertMember(db, {
      id: newMemberId(),
      organizationId: m.orgId,
      userId,
      role: m.role,
      createdAt: now,
    })
    createdMemberships.push({ organizationId: m.orgId, role: m.role })
  }

  const token = newWelcomeToken()
  const expiresAt = new Date(now.getTime() + WELCOME_TTL_SEC * 1000)
  await usersRepo.insertResetPasswordToken(db, {
    userId,
    token,
    expiresAt,
    now,
  })

  let welcomeEmailSent = false
  if (sendEmail) {
    const base = input.webBaseUrl.replace(/\/$/, '')
    let setPasswordUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`
    if (
      input.afterSetPasswordPath?.startsWith('/') &&
      !input.afterSetPasswordPath.startsWith('//')
    ) {
      setPasswordUrl += `&next=${encodeURIComponent(input.afterSetPasswordPath)}`
    }
    const tmpl = buildWelcomeSetPasswordEmailText({
      to: email,
      setPasswordUrl,
      expiresHint: 'about 1 hour',
      name,
    })
    try {
      const sent = await input.emailPort.send({
        to: tmpl.to,
        subject: tmpl.subject,
        text: tmpl.text,
        html: tmpl.html,
      })
      if (!sent.ok) throw new Error('email send returned not ok')
      welcomeEmailSent = true
    } catch {
      await usersRepo.deleteBaUserCascade(db, userId)
      throw AppError.internal('Failed to send welcome email')
    }
  }

  return {
    user: {
      id: userId,
      email,
      name,
      platformRole,
    },
    memberships: createdMemberships,
    welcomeEmailSent,
    _welcomeToken: token,
  }
}

export async function listAdminUsers(
  db: Db,
  opts?: { q?: string; limit?: number; offset?: number },
) {
  const rows = await usersRepo.listBaUsers(db, opts)
  const out: {
    id: string
    email: string
    name: string
    platformRole: PlatformRole | null
    createdAt: string
  }[] = []
  for (const r of rows) {
    const platformRole = await platformRolesRepo.getPlatformRole(db, r.id)
    out.push({
      id: r.id,
      email: r.email,
      name: r.name,
      platformRole,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    })
  }
  return out
}

export async function resendWelcome(
  db: Db,
  input: {
    actorUserId: string
    actorPlatformRole: PlatformRole
    userId: string
    webBaseUrl: string
    emailPort: EmailPort
  },
) {
  assertRateLimit(`admin-user-resend:${input.actorUserId}`, RESEND_LIMIT, RESEND_WINDOW_MS)

  if (input.actorPlatformRole !== 'super_admin' && input.actorPlatformRole !== 'staff') {
    throw AppError.forbidden('Platform role required')
  }

  const user = await usersRepo.findBaUserById(db, input.userId)
  if (!user?.email) throw AppError.notFound('User not found')

  if (input.actorPlatformRole === 'staff') {
    const actorOrgs = await orgsRepo.listMembershipsForUser(db, input.actorUserId)
    const targetOrgs = await orgsRepo.listMembershipsForUser(db, input.userId)
    const actorSet = new Set(actorOrgs.map((m) => m.organizationId))
    const shared = targetOrgs.some((m) => actorSet.has(m.organizationId))
    if (!shared) throw AppError.notFound('User not found')
  }

  await usersRepo.deleteVerificationsForUser(db, input.userId)
  const token = newWelcomeToken()
  const now = new Date()
  await usersRepo.insertResetPasswordToken(db, {
    userId: input.userId,
    token,
    expiresAt: new Date(now.getTime() + WELCOME_TTL_SEC * 1000),
    now,
  })

  const base = input.webBaseUrl.replace(/\/$/, '')
  const setPasswordUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`
  const tmpl = buildWelcomeSetPasswordEmailText({
    to: user.email,
    setPasswordUrl,
    expiresHint: 'about 1 hour',
    name: user.name,
  })
  try {
    const sent = await input.emailPort.send({
      to: tmpl.to,
      subject: tmpl.subject,
      text: tmpl.text,
      html: tmpl.html,
    })
    if (!sent.ok) throw new Error('email send returned not ok')
  } catch {
    throw AppError.internal('Failed to send welcome email')
  }

  return { ok: true as const }
}
