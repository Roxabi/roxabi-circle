import { isOrgRoleKey, type OrgKind, type OrgRoleKey } from '@gosilex/auth'
import { AppError } from '@gosilex/core'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { schema } from '../db/schema'
import * as orgsRepo from '../repos/orgs'
import * as platformModulesRepo from '../repos/platform-modules'
import * as platformRolesRepo from '../repos/platform-roles'

type Db = DrizzleD1Database<typeof schema>

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

export async function listOrgsForSubject(db: Db, subject: string) {
  const platformRole = await platformRolesRepo.getPlatformRole(db, subject)
  if (platformRole === 'super_admin') {
    const all = await orgsRepo.listAllOrgs(db)
    return all.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      kind: o.kind,
      status: o.status,
      role: null as string | null,
    }))
  }
  const memberships = await orgsRepo.listMembershipsForUser(db, subject)
  return memberships.map((m) => ({
    id: m.organizationId,
    name: m.orgName,
    slug: m.orgSlug,
    kind: m.orgKind,
    status: m.orgStatus,
    role: m.role,
  }))
}

export async function createOrganization(
  db: Db,
  input: {
    name: string
    slug?: string
    kind?: OrgKind
    ownerUserId: string
  },
) {
  const name = input.name.trim()
  if (!name) throw AppError.validation('name is required')
  const slug = slugify(input.slug?.trim() || name)
  if (!slug) throw AppError.validation('slug is required')
  const existing = await orgsRepo.findOrgBySlug(db, slug)
  if (existing) throw AppError.conflict('Organization slug already exists')

  const now = new Date()
  const orgId = newId('org')
  const kind = input.kind ?? 'client'
  await orgsRepo.insertOrganization(db, {
    id: orgId,
    name,
    slug,
    kind,
    status: 'active',
    createdAt: now,
  })
  await orgsRepo.insertMember(db, {
    id: newId('mem'),
    organizationId: orgId,
    userId: input.ownerUserId,
    role: 'owner',
    createdAt: now,
  })

  // Seed organization_modules for available platform modules (disabled by default)
  const platform = await platformModulesRepo.listPlatformModules(db)
  const ts = Date.now()
  for (const mod of platform) {
    if (!mod.available) continue
    await platformModulesRepo.upsertOrgModule(db, {
      organizationId: orgId,
      moduleId: mod.moduleId,
      enabled: false,
      locked: false,
      updatedAt: ts,
    })
  }

  return { id: orgId, name, slug, kind, status: 'active' as const }
}

export async function getOrgForSubject(db: Db, orgId: string, subject: string) {
  const org = await orgsRepo.findOrgById(db, orgId)
  if (!org) throw AppError.notFound('Organization not found')
  const platformRole = await platformRolesRepo.getPlatformRole(db, subject)
  if (platformRole === 'super_admin') {
    return { ...org, role: null as string | null, bypass: true }
  }
  const membership = await orgsRepo.findMembership(db, orgId, subject)
  if (!membership) throw AppError.notFound('Organization not found')
  return { ...org, role: membership.role, bypass: false }
}

export async function listOrgMembers(db: Db, orgId: string) {
  const members = await orgsRepo.listMembers(db, orgId)
  return members.map((m) => ({
    id: m.id,
    userId: m.userId,
    role: m.role,
    createdAt: m.createdAt,
  }))
}

export function assertOrgRoleKey(role: string): OrgRoleKey {
  if (!isOrgRoleKey(role)) {
    throw AppError.validation('Invalid organization role')
  }
  return role
}
