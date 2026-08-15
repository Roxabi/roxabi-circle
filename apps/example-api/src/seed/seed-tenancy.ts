import { COMMENTS_MODULE_ID } from '@kit/comments'
import { TASKS_MODULE_ID } from '@kit/tasks'
import { hashPassword } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { baAccount, baMember, baOrganization, baUser } from '../db/better-auth-schema'
import type { schema } from '../db/schema'
import * as platformModulesRepo from '../repos/platform-modules'
import * as platformRolesRepo from '../repos/platform-roles'
import * as orgRolesService from '../services/org-roles'
import * as platformModulesService from '../services/platform-modules'
import * as tasksService from '../services/tasks'
import { TENANCY_ORGS, TENANCY_PERSONAS } from './tenancy-data'

/** Platform-available dogfood. tasks+comments: org_acme only (ADR-0007). demo: org_acme + org_team. */
const ACME_DOGFOOD_MODULES = new Set<string>([TASKS_MODULE_ID, COMMENTS_MODULE_ID])
const PLATFORM_AVAILABLE_MODULES = new Set<string>([...ACME_DOGFOOD_MODULES, 'demo'])
const DEMO_ENABLED_ORGS = new Set(['org_acme', 'org_team'])

type Db = DrizzleD1Database<typeof schema>

export type TenancySeedResult = {
  users: { id: string; email: string; created: boolean }[]
  orgs: { id: string; slug: string; created: boolean }[]
  platformRoles: { userId: string; role: string }[]
}

/**
 * Idempotent multi-tenant seed for BA adapter demos (ADR-0003 personas).
 * Inserts BA user + credential account, platform roles, orgs, memberships, org modules.
 * Gated to development|test unless `force: true`.
 */
export async function seedTenancyDemo(
  db: Db,
  opts?: { now?: Date; environment?: string | null; force?: boolean },
): Promise<TenancySeedResult> {
  const env = opts?.environment?.trim().toLowerCase()
  if (!opts?.force && env !== 'development' && env !== 'test' && env !== undefined) {
    // When environment omitted (direct test calls), allow; only block staging/prod when set.
  }
  if (env === 'staging' || env === 'production') {
    return { users: [], orgs: [], platformRoles: [] }
  }
  if (!opts?.force && env && env !== 'development' && env !== 'test') {
    return { users: [], orgs: [], platformRoles: [] }
  }
  const now = opts?.now ?? new Date()
  const ts = now.getTime()

  await platformModulesService.ensurePlatformModules(db)

  const users: TenancySeedResult['users'] = []
  for (const p of TENANCY_PERSONAS) {
    const existing = await db.select().from(baUser).where(eq(baUser.id, p.id)).limit(1)
    if (existing[0]) {
      users.push({ id: p.id, email: p.email, created: false })
    } else {
      const passwordHash = await hashPassword(p.password)
      await db.insert(baUser).values({
        id: p.id,
        name: p.name,
        email: p.email,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      await db.insert(baAccount).values({
        id: `acc_${p.id}`,
        accountId: p.id,
        providerId: 'credential',
        userId: p.id,
        password: passwordHash,
        createdAt: now,
        updatedAt: now,
      })
      users.push({ id: p.id, email: p.email, created: true })
    }
    if (p.platformRole) {
      await platformRolesRepo.setPlatformRole(db, p.id, p.platformRole, ts)
    }
  }

  const orgs: TenancySeedResult['orgs'] = []
  for (const o of TENANCY_ORGS) {
    const existing = await db
      .select()
      .from(baOrganization)
      .where(eq(baOrganization.id, o.id))
      .limit(1)
    if (existing[0]) {
      orgs.push({ id: o.id, slug: o.slug, created: false })
    } else {
      await db.insert(baOrganization).values({
        id: o.id,
        name: o.name,
        slug: o.slug,
        kind: o.kind,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      orgs.push({ id: o.id, slug: o.slug, created: true })
    }

    for (const m of o.members) {
      const memId = `mem_${o.id}_${m.userId}`
      const memExisting = await db.select().from(baMember).where(eq(baMember.id, memId)).limit(1)
      if (!memExisting[0]) {
        await db.insert(baMember).values({
          id: memId,
          organizationId: o.id,
          userId: m.userId,
          role: m.role,
          createdAt: now,
        })
      }
    }

    // Phase B — system roles + module grants (before org module enable)
    await orgRolesService.ensureSystemRoles(db, o.id)
  }

  // Dogfood: platform-available set; tasks/comments on org_acme; demo on org_acme + org_team
  for (const moduleId of PLATFORM_AVAILABLE_MODULES) {
    await platformModulesRepo.upsertPlatformModule(db, {
      moduleId,
      available: true,
      configJson: null,
      updatedAt: ts,
    })
  }
  const platform = await platformModulesRepo.listPlatformModules(db)
  for (const o of TENANCY_ORGS) {
    for (const mod of platform) {
      const enabled =
        Boolean(mod.available) &&
        (mod.moduleId === 'demo'
          ? DEMO_ENABLED_ORGS.has(o.id)
          : o.id === 'org_acme' && ACME_DOGFOOD_MODULES.has(mod.moduleId))
      await platformModulesRepo.upsertOrgModule(db, {
        organizationId: o.id,
        moduleId: mod.moduleId,
        enabled,
        locked: false,
        updatedAt: ts,
      })
    }
    if (o.id === 'org_acme') {
      await tasksService.ensureDefaultBoard(db, o.id)
    }
  }

  const platformRoles = TENANCY_PERSONAS.filter((p) => p.platformRole).map((p) => ({
    userId: p.id,
    role: p.platformRole!,
  }))

  return { users, orgs, platformRoles }
}
