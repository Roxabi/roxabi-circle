import { createDb } from '@kit/db'
import { FLOWS_MODULE_ID } from '@kit/flows'
import { and, eq } from 'drizzle-orm'
import { expect } from 'vitest'
import { createApp } from '../app'
import { baMember } from '../db/better-auth-schema'
import { flowPlans, flowRuns, schema } from '../db/schema'
import type { KitDb } from '../lib/db-type'
import * as orgRolesRepo from '../repos/org-roles'
import { seedDemoDatabase } from '../seed/seed-db'
import { TENANCY_PASSWORD } from '../seed/tenancy-data'
import { setOrgModuleEnabled, setPlatformAvailable } from '../services/platform-modules'
import { createMemoryEnv } from './memory-env'

export const ORIGIN = 'http://localhost:5173'
export const ORG_ACME = 'org_acme'
export const ORG_TEAM = 'org_team'
export const STAFF_EMAIL = 'staff@kit.local'
export const MEMBER_EMAIL = 'team-owner@kit.local'
export const SUPER_EMAIL = 'super@kit.local'
export const BOTH_ORGS = [ORG_ACME, ORG_TEAM] as const
/** Custom org role key — write grant, not owner/admin (T18). */
export const operator = 'operator'

/** T2 — platform available then org-enable. Seed does not enable flows. */
export async function enableFlowsForOrgs(db: KitDb, orgIds: readonly string[]) {
  await setPlatformAvailable(db, FLOWS_MODULE_ID, true)
  for (const orgId of orgIds) {
    await setOrgModuleEnabled(db, orgId, FLOWS_MODULE_ID, true)
  }
}

export type FlowsApp = ReturnType<typeof createApp>
export type FlowsEnv = ReturnType<typeof createMemoryEnv>

export function freshApp() {
  const app = createApp()
  const env = createMemoryEnv()
  return { app, env }
}

export async function seedFlowsApp() {
  const { app, env } = freshApp()
  const db = createDb(env.DB as unknown as D1Database, schema)
  await seedDemoDatabase(db, { notes: true, environment: 'test' })
  return { app, env, db }
}

export function sessionHeaders(cookie: string, orgId = ORG_ACME): Record<string, string> {
  return {
    cookie,
    'content-type': 'application/json',
    Origin: ORIGIN,
    'X-Org-Id': orgId,
  }
}

export function bearerHeaders(key: string, orgId = ORG_ACME): Record<string, string> {
  return {
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    Origin: ORIGIN,
    'X-Org-Id': orgId,
  }
}

export async function login(app: FlowsApp, env: FlowsEnv, email: string) {
  const res = await app.request(
    '/api/auth/sign-in/email',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ email, password: TENANCY_PASSWORD }),
    },
    env,
  )
  expect(res.status, `sign-in ${email}`).toBeLessThan(400)
  const setCookie = res.headers.get('set-cookie')
  expect(setCookie).toBeTruthy()
  return setCookie!.split(';')[0]!
}

/** Insert a plan then a run in org_team (composite FK). snapshot_json is '{}' for RED. */
export async function insertTeamPlanAndRun(db: KitDb, ids: { planId: string; runId: string }) {
  const now = Date.now()
  await db
    .insert(flowPlans)
    .values({
      id: ids.planId,
      orgId: ORG_TEAM,
      planKey: 'stolen-plan',
      version: 1,
      enabled: true,
      planJson: '{}',
      planDigest: 'digest',
      createdAt: now,
      updatedAt: now,
    })
    .run()
  await db
    .insert(flowRuns)
    .values({
      id: ids.runId,
      orgId: ORG_TEAM,
      planId: ids.planId,
      planKey: 'stolen-plan',
      status: 'queued',
      actorId: 'user_team_owner',
      snapshotJson: '{}',
      planDigest: 'digest',
      createdAt: now,
      updatedAt: now,
    })
    .run()
}

export async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status)
  const body = (await res.json()) as { error: { code: string }; requestId: string }
  expect(body.error.code).toBe(code)
  expect(body.requestId).toMatch(/^req_/)
}

/**
 * Mint custom `operator` with flows=write on org_acme and assign to team-owner
 * (seed member there). HTTP create; repo upsert if the role API rejects flows.
 */
export async function mintOperatorWriteOnAcme(
  app: FlowsApp,
  env: FlowsEnv,
  db: KitDb,
  staffCookie: string,
): Promise<'http' | 'repo'> {
  const created = await app.request(
    `/api/orgs/${ORG_ACME}/roles`,
    {
      method: 'POST',
      headers: sessionHeaders(staffCookie),
      body: JSON.stringify({
        key: operator,
        name: 'Operator',
        grants: [{ moduleId: FLOWS_MODULE_ID, access: 'write' }],
      }),
    },
    env,
  )
  let via: 'http' | 'repo' = 'http'
  if (created.status !== 201) {
    via = 'repo'
    const roleId = 'role_operator_acme'
    await orgRolesRepo.insertRole(db, {
      id: roleId,
      organizationId: ORG_ACME,
      key: operator,
      name: 'Operator',
      isSystem: false,
      createdAt: Date.now(),
    })
    await orgRolesRepo.upsertGrant(db, {
      roleId,
      moduleId: FLOWS_MODULE_ID,
      access: 'write',
    })
  }
  await db
    .update(baMember)
    .set({ role: operator })
    .where(and(eq(baMember.userId, 'user_team_owner'), eq(baMember.organizationId, ORG_ACME)))
    .run()
  return via
}
