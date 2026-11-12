import { canAdminFlows, canCreateFlowRun, canDecideFlowApproval, FLOWS_MODULE_ID } from '@kit/flows'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { schema } from '../db/schema'
import { resolveModuleAccess } from './org-roles'

type Db = DrizzleD1Database<typeof schema>

export type FlowConsoleCapabilities = {
  setPlanEnabled: boolean
  createPlan: boolean
  createRun: boolean
}
export type FlowRunCapabilities = { decideApproval: boolean }

type Actor = {
  orgId: string
  orgRole: string | null | undefined
  authMethod: 'session' | 'api_key' | null | undefined
}

async function moduleWrite(db: Db, input: Actor): Promise<boolean> {
  return resolveModuleAccess(db, {
    organizationId: input.orgId,
    roleKey: input.orgRole ?? undefined,
    moduleId: FLOWS_MODULE_ID,
    op: 'write',
  })
}

/**
 * Same decision as PATCH plan and POST run: module write grant, then
 * `canAdminFlows` / `canCreateFlowRun`. Callers must not re-declare the roles.
 */
export async function flowConsoleCapabilities(
  db: Db,
  input: Actor,
): Promise<FlowConsoleCapabilities> {
  const write = await moduleWrite(db, input)
  const admin = write && canAdminFlows({ orgRole: input.orgRole })
  return {
    setPlanEnabled: admin,
    createPlan: admin,
    createRun:
      write &&
      canCreateFlowRun({
        orgRole: input.orgRole,
        authMethod: input.authMethod,
      }),
  }
}

/**
 * Same decision as POST approval: module write + `canDecideFlowApproval`.
 * Advisory only — the handler re-checks. No platform shortcut (ADR-0005 D3/D4).
 */
export async function flowRunCapabilities(db: Db, input: Actor): Promise<FlowRunCapabilities> {
  const write = await moduleWrite(db, input)
  return {
    decideApproval:
      write &&
      canDecideFlowApproval({
        orgRole: input.orgRole,
        authMethod: input.authMethod,
      }),
  }
}
