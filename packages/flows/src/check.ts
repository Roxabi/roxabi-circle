import type { CapabilityGrant, EffectiveAuthority } from './authority'
import { unionAfterWithBindings } from './bindings'
import {
  collectEffectPermitIssues,
  collectGrantMetaIssues,
  collectGraphShapeIssues,
  collectModelIssues,
  collectTokenBudgetIssues,
  collectToolAuthorityIssues,
} from './check-issues'
import { parseCapabilityGrant } from './grant'
import { findCycle as findCycleInGraph } from './graph'
import type { ToolRegistry } from './registry'
import { type PlanDocument, safeParsePlanDocument } from './schema'

export type CheckIssueCode =
  | 'SCHEMA_INVALID'
  | 'GRANT_INVALID'
  | 'EMPTY_PERMITS'
  | 'UNKNOWN_TOOL'
  | 'TOOL_NOT_GRANTED'
  | 'TOOL_NOT_GRANTABLE'
  | 'GRANT_NOT_MINTED'
  | 'REGISTRY_NOT_KIT_BUILT'
  | 'TOOL_NOT_IN_PERMITS'
  | 'INFER_NOT_GRANTED'
  | 'EMPTY_MODELS'
  | 'MODEL_NOT_GRANTED'
  | 'UNKNOWN_TASK_EDGE'
  | 'CYCLE'
  | 'TOO_MANY_TASKS'
  | 'TOKEN_CEILING'
  | 'REGISTRY_VERSION_REQUIRED'
  | 'REGISTRY_VERSION_MISMATCH'
  | 'ORG_ID_REQUIRED'
  | 'BINDING_NOT_WHOLE'
  | 'ARG_KEY_FORBIDDEN'

export type CheckIssue = {
  code: CheckIssueCode
  message: string
  path?: string
}

export type CheckResult =
  | { ok: true; effective: EffectiveAuthority; plan: PlanDocument; grant: CapabilityGrant }
  | { ok: false; issues: CheckIssue[] }

function invokedTools(plan: PlanDocument): Array<{ taskId: string; tool: string }> {
  const out: Array<{ taskId: string; tool: string }> = []
  for (const [taskId, task] of Object.entries(plan.tasks)) {
    if (task.invoke) {
      out.push({ taskId, tool: task.invoke.tool })
    }
  }
  return out
}

function planGraphWithBindings(plan: PlanDocument): Record<string, { after?: string[] }> {
  const out: Record<string, { after?: string[] }> = {}
  for (const [taskId, task] of Object.entries(plan.tasks)) {
    const after = unionAfterWithBindings(task.after, task.invoke?.args)
    out[taskId] = after === undefined ? {} : { after }
  }
  return out
}

function findCycle(plan: PlanDocument): string | null {
  return findCycleInGraph(planGraphWithBindings(plan))
}

/**
 * Pure plan check — re-validates plan + grant schemas, then
 * authority = grants ∩ permits ∩ registry, with every granted tool required to be
 * `grantClass: 'mintable'` in the pinned registry.
 *
 * @capability flows-plan-check
 * @tag critical
 * @invariant default-deny-ambient-authority: absent or empty plan permits with any effectful task (invoke or infer) fail closed at check — ADR-0005 D4 § Authority split
 * @invariant plan-cannot-expand-authority: a plan cannot expand beyond grants — a permits.tools entry outside the grant is TOOL_NOT_GRANTED — ADR-0005 D4 § Authority split
 * @invariant grant-holds-only-mintable-tools: every grant.allowedTools entry is declared mintable by the pinned registry — a grant that did not come from mintCapabilityGrant, or one outlived by a tightened registry, is TOOL_NOT_GRANTABLE — ADR-0005 D4 amendment
 * @contract flows-check-port: checkPlan(plan, grant, registry) -> CheckResult
 */
export function checkPlan(
  planInput: unknown,
  grantInput: unknown,
  registry: ToolRegistry,
): CheckResult {
  const parsed = safeParsePlanDocument(planInput)
  if (!parsed.success) {
    const issues: CheckIssue[] = parsed.error.issues.map((zi) => ({
      code: 'SCHEMA_INVALID' as const,
      message: zi.message,
      path: zi.path.length ? zi.path.join('.') : 'plan',
    }))
    if (issues.length === 0) {
      issues.push({ code: 'SCHEMA_INVALID', message: 'plan schema invalid', path: 'plan' })
    }
    return { ok: false, issues }
  }
  const plan = parsed.data

  const grantParsed = parseCapabilityGrant(grantInput)
  if (!grantParsed.ok) {
    return {
      ok: false,
      issues: [{ code: 'GRANT_INVALID', message: grantParsed.message, path: 'grant' }],
    }
  }
  const grant = grantParsed.grant
  const invokes = invokedTools(plan)
  const issues: CheckIssue[] = [
    ...collectGrantMetaIssues(grant, registry),
    ...collectEffectPermitIssues(plan, grant, invokes),
    ...collectModelIssues(plan, grant),
    ...collectGraphShapeIssues(plan, findCycle),
  ]
  const tools = collectToolAuthorityIssues(plan, grant, registry, invokes)
  issues.push(...tools.issues)
  issues.push(...collectTokenBudgetIssues(plan))

  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, effective: tools.effective, plan, grant }
}
