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
 * D11: when `authMethod === 'api_key'`, `orgs` is filtered to `keyOrganizationId`
 * if set, otherwise **empty** (fail-closed — never the full membership catalogue).
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

  // D11 — api_key is fail-closed: unbound / missing key org → empty orgs (never full catalogue)
  const keyOrg = opts?.keyOrganizationId
  if (opts?.authMethod === 'api_key') {
    orgs = keyOrg ? orgs.filter((o) => o.id === keyOrg) : []
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
