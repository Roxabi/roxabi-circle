/**
 * GET /api/me aggregate — platform role, BA profile, membership orgs (D11 key filter).
 */
import type { PlatformRole } from '@kit/auth'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { schema } from '../db/schema'
import * as platformRolesRepo from '../repos/platform-roles'
import * as usersRepo from '../repos/users'
import * as orgsService from './orgs'

type Db = DrizzleD1Database<typeof schema>

export type MeOrg = Awaited<ReturnType<typeof orgsService.listMembershipOrgsForSubject>>[number]

export type MeProfile = {
  platformRole: PlatformRole | null
  email?: string
  name?: string
  orgs: MeOrg[]
}

/**
 * Profile payload for the authenticated subject.
 * When `authMethod === 'api_key'` and `keyOrganizationId` is set, `orgs` is filtered to that org (D11).
 */
export async function getMeProfile(
  db: Db,
  subject: string,
  opts?: {
    authMethod?: 'session' | 'api_key' | string
    keyOrganizationId?: string | null
  },
): Promise<MeProfile> {
  const platformRole = await platformRolesRepo.getPlatformRole(db, subject)
  let orgs = await orgsService.listMembershipOrgsForSubject(db, subject)

  // D11 — org-bound sk_ only sees its org in me.orgs
  const keyOrg = opts?.keyOrganizationId
  if (opts?.authMethod === 'api_key' && keyOrg) {
    orgs = orgs.filter((o) => o.id === keyOrg)
  }

  const baUser = await usersRepo.findBaUserById(db, subject)
  const email = baUser?.email?.trim() || undefined
  const name = baUser?.name?.trim() || undefined

  return {
    platformRole,
    ...(email ? { email } : {}),
    ...(name ? { name } : {}),
    orgs,
  }
}
