import {
  type CapabilityGrant,
  type EffectiveAuthority,
  resolveEffectiveAuthority,
} from './authority'
import { hardMaxTokens, staticTokenBudget } from './budget'
import { MAX_PLAN_TASKS, MAX_PLAN_TOTAL_TOKENS } from './constants'
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
  | 'TOOL_NOT_IN_PERMITS'
  | 'INFER_NOT_GRANTED'
  | 'UNKNOWN_TASK_EDGE'
  | 'CYCLE'
  | 'TOO_MANY_TASKS'
  | 'TOKEN_CEILING'
  | 'REGISTRY_VERSION_REQUIRED'
  | 'REGISTRY_VERSION_MISMATCH'
  | 'ORG_ID_REQUIRED'

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

function findCycle(plan: PlanDocument): string | null {
  return findCycleInGraph(plan.tasks)
}

/**
 * Pure plan check — re-validates plan + grant schemas, then
 * authority = grants ∩ permits ∩ registry.
 *
 * @capability flows-plan-check
 * @tag critical
 * @invariant default-deny-ambient-authority: absent or empty plan permits with any effectful task (invoke or infer) fail closed at check — ADR-0005 D4 § Authority split
 * @invariant plan-cannot-expand-authority: a plan cannot expand beyond grants — a permits.tools entry outside the grant is TOOL_NOT_GRANTED — ADR-0005 D4 § Authority split
 * @contract flows-check-port: checkPlan(plan, grant, registry) -> CheckResult
 */
export function checkPlan(
  planInput: unknown,
  grantInput: unknown,
  registry: ToolRegistry,
): CheckResult {
  const issues: CheckIssue[] = []

  const parsed = safeParsePlanDocument(planInput)
  if (!parsed.success) {
    for (const zi of parsed.error.issues) {
      issues.push({
        code: 'SCHEMA_INVALID',
        message: zi.message,
        path: zi.path.length ? zi.path.join('.') : 'plan',
      })
    }
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

  if (!grant.orgId || grant.orgId.trim() === '') {
    issues.push({ code: 'ORG_ID_REQUIRED', message: 'grant.orgId is required' })
  }

  if (!grant.registryVersion || grant.registryVersion.trim() === '') {
    issues.push({
      code: 'REGISTRY_VERSION_REQUIRED',
      message: 'grant.registryVersion is required (no silent pin)',
    })
  } else if (grant.registryVersion !== registry.version) {
    issues.push({
      code: 'REGISTRY_VERSION_MISMATCH',
      message: `grant registryVersion ${grant.registryVersion} !== registry ${registry.version}`,
    })
  }

  const taskCount = Object.keys(plan.tasks).length
  if (taskCount > MAX_PLAN_TASKS) {
    issues.push({
      code: 'TOO_MANY_TASKS',
      message: `tasks ${taskCount} exceeds max ${MAX_PLAN_TASKS}`,
    })
  }

  const invokes = invokedTools(plan)
  const hasInfer = Object.values(plan.tasks).some((t) => t.infer !== undefined)
  if (plan.permits.tools.length === 0 && (invokes.length > 0 || hasInfer)) {
    issues.push({
      code: 'EMPTY_PERMITS',
      message:
        'permits.tools is empty but plan has effectful tasks (invoke and/or infer) — fail-closed',
      path: 'permits.tools',
    })
  }

  if (hasInfer && !grant.allowsInfer) {
    issues.push({
      code: 'INFER_NOT_GRANTED',
      message:
        'plan has infer tasks but grant.allowsInfer is false — infer is not ambient (option A)',
      path: 'grant.allowsInfer',
    })
  }

  for (const [taskId, task] of Object.entries(plan.tasks)) {
    for (const dep of task.after ?? []) {
      if (!Object.hasOwn(plan.tasks, dep)) {
        issues.push({
          code: 'UNKNOWN_TASK_EDGE',
          message: `task ${taskId} after: unknown task ${dep}`,
          path: `tasks.${taskId}.after`,
        })
      }
    }
  }

  const cycle = findCycle(plan)
  if (cycle) issues.push({ code: 'CYCLE', message: cycle })

  const effective = resolveEffectiveAuthority(plan, grant, registry)
  const grantSet = new Set(grant.allowedTools)
  const planSet = new Set(plan.permits.tools)

  for (const { taskId, tool } of invokes) {
    if (!registry.tools.has(tool)) {
      issues.push({
        code: 'UNKNOWN_TOOL',
        message: `tool ${tool} not in registry`,
        path: `tasks.${taskId}.invoke.tool`,
      })
      continue
    }
    if (!planSet.has(tool)) {
      issues.push({
        code: 'TOOL_NOT_IN_PERMITS',
        message: `tool ${tool} not listed in permits.tools`,
        path: `tasks.${taskId}.invoke.tool`,
      })
    }
    if (!grantSet.has(tool)) {
      issues.push({
        code: 'TOOL_NOT_GRANTED',
        message: `tool ${tool} not in org/admin capability grant`,
        path: `tasks.${taskId}.invoke.tool`,
      })
    }
  }

  for (const tool of plan.permits.tools) {
    if (!grantSet.has(tool)) {
      issues.push({
        code: 'TOOL_NOT_GRANTED',
        message: `permits.tools lists ${tool} outside grant (plan cannot expand authority)`,
        path: 'permits.tools',
      })
    }
    if (!registry.tools.has(tool)) {
      issues.push({
        code: 'UNKNOWN_TOOL',
        message: `permits.tools lists unknown tool ${tool}`,
        path: 'permits.tools',
      })
    }
  }

  const tokenBudget = staticTokenBudget(plan)
  if (tokenBudget > MAX_PLAN_TOTAL_TOKENS) {
    issues.push({
      code: 'TOKEN_CEILING',
      message: `static infer token budget ${tokenBudget} exceeds ${MAX_PLAN_TOTAL_TOKENS}`,
    })
  }
  const hard = hardMaxTokens(plan)
  if (plan.plan.max_tokens !== undefined && tokenBudget > plan.plan.max_tokens) {
    issues.push({
      code: 'TOKEN_CEILING',
      message: `static infer token budget ${tokenBudget} exceeds plan.max_tokens total ceiling ${plan.plan.max_tokens}`,
      path: 'plan.max_tokens',
    })
  }
  // hard is min(static, plan) — if static already failed above, hard is covered
  void hard

  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, effective, plan, grant }
}
