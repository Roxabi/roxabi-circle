import { MODULE_DENIAL } from '@kit/auth/hono'
import { AppError, createLogger } from '@kit/core'
import {
  type CapabilityGrant,
  FLOWS_MODULE_ID,
  MAX_ALLOWED_MODELS,
  MAX_MODEL_ID_CHARS,
  type MintDenyCode,
  mintCapabilityGrant,
} from '@kit/flows'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { schema } from '../db/schema'
import { dogfoodToolRegistry } from '../lib/flows-dogfood'
import { resolveModuleAccess } from './org-roles'
import { isModuleEffective } from './platform-modules'

type Db = DrizzleD1Database<typeof schema>

/**
 * Resolve org module policy facts server-side, then mint. The request org id and
 * the actor's org role are the only inputs — never a client field, plan body or
 * agent self-description. A denial fails closed as a validation error.
 */
export async function mintGrantForOrg(
  db: Db,
  orgId: string,
  orgRole: string | null | undefined,
  allowedModels: readonly string[],
): Promise<CapabilityGrant> {
  const [moduleEffective, canRead, canWrite] = await Promise.all([
    isModuleEffective(db, orgId, FLOWS_MODULE_ID),
    resolveModuleAccess(db, {
      organizationId: orgId,
      roleKey: orgRole ?? undefined,
      moduleId: FLOWS_MODULE_ID,
      op: 'read',
    }),
    resolveModuleAccess(db, {
      organizationId: orgId,
      roleKey: orgRole ?? undefined,
      moduleId: FLOWS_MODULE_ID,
      op: 'write',
    }),
  ])
  const minted = mintCapabilityGrant({
    orgId,
    registry: dogfoodToolRegistry,
    facts: {
      moduleEffective,
      canRead,
      canWrite,
      allowedModels,
    },
  })
  if (!minted.ok) {
    throw mintDenialError(minted.code, minted.message)
  }
  return minted.grant
}

/**
 * Mirror `requireModule` (`@kit/auth/hono`) for the same two conditions: a
 * module that is not effective for the org is 404 and a role without the grant
 * is 403. The wording comes from the shared `MODULE_DENIAL` literal so the two
 * layers stay indistinguishable. The backstop must answer exactly as
 * `requireModule` does and must not invent a third answer.
 *
 * HTTP flows operations already attach `requireModule`, so these arms are not
 * caller-reachable on that path except via a TOCTOU window (an admin disabling
 * the module between the middleware's read and the service's read inside one
 * in-flight request) or a future non-HTTP caller of `mintGrantForOrg`. The
 * mapping is defence-in-depth: without it those cases would 400 as a
 * validation failure. `ORG_ID_REQUIRED` / `GRANT_INVALID` are server-side
 * misuse and stay 400.
 *
 * Every `MintDenyCode` is listed and there is NO `default`: a new denial code
 * must fail to compile here rather than inherit 400 by accident.
 */
function mintDenialError(code: MintDenyCode, message: string): AppError {
  switch (code) {
    case 'MODULE_NOT_EFFECTIVE':
      return AppError.notFound(MODULE_DENIAL.notAvailable)
    case 'MODULE_ACCESS_DENIED':
      return AppError.forbidden(MODULE_DENIAL.insufficientGrant)
    case 'ORG_ID_REQUIRED':
    case 'GRANT_INVALID':
      return AppError.validation(message, { code })
  }
}

const log = createLogger({ service: 'example-api', component: 'flows-grant' })

/** Malformed server allowlist. Not a client error. */
export class FlowAllowedModelsInvalid extends Error {
  constructor() {
    super('model allowlist invalid')
  }
}

/**
 * Server env only. Unset, blank, or comma-only → []. Trim, drop empties, dedup
 * before the count cap. Never reads a request body.
 */
export function parseFlowAllowedModels(raw: unknown): string[] {
  if (raw === undefined) return []
  if (typeof raw !== 'string') throw new FlowAllowedModelsInvalid()
  if (raw.trim() === '') return []
  const ids = [
    ...new Set(
      raw
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
    ),
  ]
  if (ids.length > MAX_ALLOWED_MODELS) throw new FlowAllowedModelsInvalid()
  for (const id of ids) {
    if (id.length > MAX_MODEL_ID_CHARS) throw new FlowAllowedModelsInvalid()
  }
  return ids
}

function planHasInfer(plan: unknown): boolean {
  if (!plan || typeof plan !== 'object' || !('tasks' in plan)) return false
  const tasks = plan.tasks
  if (!tasks || typeof tasks !== 'object') return false
  return Object.values(tasks).some(
    (task) => !!task && typeof task === 'object' && 'infer' in task && task.infer !== undefined,
  )
}

/**
 * The list binds infer only. A malformed allowlist is a server error when the
 * plan infers, and is ignored for invoke/approve-only plans.
 */
export function allowedModelsForPlan(raw: unknown, plan: unknown): readonly string[] {
  try {
    return parseFlowAllowedModels(raw)
  } catch (err) {
    if (!(err instanceof FlowAllowedModelsInvalid)) throw err
    if (!planHasInfer(plan)) return []
    log.error('flow_model_allowlist_invalid', {})
    throw AppError.internal()
  }
}
