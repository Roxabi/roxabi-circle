import { normalizeEmail } from '@kit/auth'
import { AppError } from '@kit/core'
import {
  buildInviteEmailText,
  buildWelcomeSetPasswordEmailText,
  createLogEmailPort,
  type EmailPort,
} from '@kit/email'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { schema } from '../db/schema'
import { assertRateLimit } from '../lib/rate-limit'
import * as invitationsRepo from '../repos/invitations'
import * as orgsRepo from '../repos/orgs'
import * as usersRepo from '../repos/users'
import * as auditService from './audit'
import * as orgRolesService from './org-roles'
import { provisionUserShell } from './user-shell'

type Db = DrizzleD1Database<typeof schema>

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const CREATE_LIMIT = 20
const CREATE_WINDOW_MS = 60 * 60 * 1000
const ACCEPT_LIMIT = 30
const ACCEPT_WINDOW_MS = 60 * 60 * 1000

function newInviteId(): string {
  return `inv_${crypto.randomUUID().replace(/-/g, '')}`
}

function newMemberId(): string {
  return `mem_${crypto.randomUUID().replace(/-/g, '')}`
}

function publicInvitation(row: {
  id: string
  organizationId: string
  email: string
  role: string
  status: string
  expiresAt: Date | null
  createdAt: Date
  inviterId: string
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    email: row.email,
    role: row.role,
    status: row.status,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    inviterId: row.inviterId,
  }
}

export async function createInvitation(
  db: Db,
  input: {
    orgId: string
    inviterUserId: string
    inviterOrgRole: string
    email: string
    role: string
    acceptBaseUrl: string
    emailPort?: EmailPort
    requestId?: string
  },
) {
  await assertRateLimit(db, `invite-create:${input.orgId}`, CREATE_LIMIT, CREATE_WINDOW_MS)

  const org = await orgsRepo.findOrgById(db, input.orgId)
  if (!org) throw AppError.notFound('Organization not found')
  if (org.status !== 'active') {
    throw AppError.forbidden('Organization is not active')
  }

  // Phase B: system invitable keys or org custom keys with ceiling
  await orgRolesService.assertAssignableRole(db, input.orgId, input.role, input.inviterOrgRole)
  const role = input.role

  const email = normalizeEmail(input.email)
  if (!email?.includes('@')) {
    throw AppError.validation('Invalid email', { email: ['Valid email required'] })
  }

  // Already a member?
  const existingUser = await usersRepo.findBaUserByEmail(db, email)
  if (existingUser) {
    const membership = await orgsRepo.findMembership(db, input.orgId, existingUser.id)
    if (membership) {
      throw AppError.conflict('User is already a member of this organization')
    }
  }

  const pendingDup = await invitationsRepo.findPendingByOrgAndEmail(db, input.orgId, email)
  if (pendingDup) {
    throw AppError.conflict('A pending invitation already exists for this email')
  }

  // S3: unknown email → shell user + welcome set-password (no public signup)
  let provisionedUserId: string | null = null
  let welcomeToken: string | null = null
  if (!existingUser) {
    const shell = await provisionUserShell(db, { email })
    provisionedUserId = shell.userId
    welcomeToken = shell.welcomeToken
    const emailDomain = email.includes('@') ? email.split('@')[1] : undefined
    await auditService.appendAudit(db, {
      action: 'user.created',
      actorUserId: input.inviterUserId,
      targetType: 'user',
      targetId: shell.userId,
      orgId: input.orgId,
      meta: emailDomain ? { emailDomain } : undefined,
      requestId: input.requestId,
    })
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS)
  const id = newInviteId()

  await invitationsRepo.insertInvitation(db, {
    id,
    organizationId: input.orgId,
    email,
    role,
    status: 'pending',
    expiresAt,
    createdAt: now,
    inviterId: input.inviterUserId,
  })

  const base = input.acceptBaseUrl.replace(/\/$/, '')
  const acceptUrl = `${base}/invite/accept?invitationId=${encodeURIComponent(id)}`
  const inviter = await usersRepo.findBaUserById(db, input.inviterUserId)
  const port = input.emailPort ?? createLogEmailPort()

  try {
    if (welcomeToken && provisionedUserId) {
      const setPasswordUrl = `${base}/reset-password?token=${encodeURIComponent(welcomeToken)}&next=${encodeURIComponent(`/invite/accept?invitationId=${id}`)}`
      const tmpl = buildWelcomeSetPasswordEmailText({
        to: email,
        setPasswordUrl,
        expiresHint: 'about 1 hour',
      })
      const sent = await port.send({
        to: tmpl.to,
        subject: tmpl.subject,
        text: tmpl.text,
        html: tmpl.html,
      })
      if (!sent.ok) throw new Error('email send returned not ok')
    } else {
      const tmpl = buildInviteEmailText({
        to: email,
        orgName: org.name,
        acceptUrl,
        expiresAt,
        inviterLabel: inviter?.email ?? input.inviterUserId,
      })
      const sent = await port.send({
        to: tmpl.to,
        subject: tmpl.subject,
        text: tmpl.text,
        html: tmpl.html,
      })
      if (!sent.ok) throw new Error('email send returned not ok')
    }
  } catch {
    await invitationsRepo.setInvitationStatus(db, id, 'canceled')
    if (provisionedUserId) {
      await usersRepo.deleteBaUserCascade(db, provisionedUserId)
    }
    throw AppError.internal('Failed to send invitation email')
  }

  const row = await invitationsRepo.findInvitationById(db, id)
  if (!row) throw AppError.internal('Invitation missing after create')
  return publicInvitation(row)
}

export async function listInvitations(
  db: Db,
  orgId: string,
  status: invitationsRepo.InvitationStatus = 'pending',
) {
  const rows = await invitationsRepo.listInvitationsForOrg(db, orgId, status)
  return rows.map(publicInvitation)
}

export async function cancelInvitation(db: Db, orgId: string, invitationId: string) {
  const row = await invitationsRepo.findInvitationById(db, invitationId)
  if (!row || row.organizationId !== orgId) {
    throw AppError.notFound('Invitation not found')
  }
  if (row.status !== 'pending') {
    throw AppError.conflict('Invitation is not pending')
  }
  await invitationsRepo.setInvitationStatus(db, invitationId, 'canceled')
  return { ok: true as const }
}

export async function acceptInvitation(
  db: Db,
  input: {
    invitationId: string
    subjectUserId: string
    rateKey: string
    requestId?: string
  },
) {
  await assertRateLimit(db, `invite-accept:${input.rateKey}`, ACCEPT_LIMIT, ACCEPT_WINDOW_MS)

  const row = await invitationsRepo.findInvitationById(db, input.invitationId)
  if (row?.status !== 'pending') {
    throw AppError.notFound('Invitation not found')
  }
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    throw AppError.notFound('Invitation not found')
  }

  const org = await orgsRepo.findOrgById(db, row.organizationId)
  if (!org) throw AppError.notFound('Invitation not found')
  if (org.status !== 'active') {
    throw AppError.forbidden('Organization is not active')
  }

  const user = await usersRepo.findBaUserById(db, input.subjectUserId)
  if (!user?.email) throw AppError.unauthorized()
  if (normalizeEmail(user.email) !== normalizeEmail(row.email)) {
    throw AppError.forbidden('Invitation email does not match session')
  }

  const existing = await orgsRepo.findMembership(db, row.organizationId, input.subjectUserId)
  if (existing) {
    await invitationsRepo.setInvitationStatus(db, row.id, 'accepted')
    await auditService.appendAudit(db, {
      action: 'invite.accept',
      actorUserId: input.subjectUserId,
      targetType: 'invitation',
      targetId: row.id,
      orgId: row.organizationId,
      meta: { invitationId: row.id },
      requestId: input.requestId,
    })
    return {
      org: { id: org.id, name: org.name, slug: org.slug },
      membership: {
        id: existing.id,
        userId: existing.userId,
        role: existing.role,
        organizationId: existing.organizationId,
      },
    }
  }

  const memberId = newMemberId()
  await orgsRepo.insertMember(db, {
    id: memberId,
    organizationId: row.organizationId,
    userId: input.subjectUserId,
    role: row.role,
    createdAt: new Date(),
  })
  await invitationsRepo.setInvitationStatus(db, row.id, 'accepted')

  await auditService.appendAudit(db, {
    action: 'membership.add',
    actorUserId: input.subjectUserId,
    targetType: 'user',
    targetId: input.subjectUserId,
    orgId: row.organizationId,
    meta: { role: row.role },
    requestId: input.requestId,
  })
  await auditService.appendAudit(db, {
    action: 'invite.accept',
    actorUserId: input.subjectUserId,
    targetType: 'invitation',
    targetId: row.id,
    orgId: row.organizationId,
    meta: { invitationId: row.id },
    requestId: input.requestId,
  })

  return {
    org: { id: org.id, name: org.name, slug: org.slug },
    membership: {
      id: memberId,
      userId: input.subjectUserId,
      role: row.role,
      organizationId: row.organizationId,
    },
  }
}
