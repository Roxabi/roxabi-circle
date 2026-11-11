/** Issue collectors for checkPlan — split by authority concern (Roxabi/roxabi-boilerplate-cf#287 cog-authz). */

import {
  type CapabilityGrant,
  type EffectiveAuthority,
  resolveEffectiveAuthority,
} from './authority'
import { collectInvokeBindingIssues } from './bindings'
import { hardMaxTokens, staticTokenBudget } from './budget'
import type { CheckIssue } from './check'
import { MAX_PLAN_TASKS, MAX_PLAN_TOTAL_TOKENS } from './constants'
import type { ToolRegistry } from './registry'
import type { PlanDocument } from './schema'

export function collectGrantMetaIssues(
  grant: CapabilityGrant,
  registry: ToolRegistry,
): CheckIssue[] {
  const issues: CheckIssue[] = []
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
  return issues
}

export function collectEffectPermitIssues(
  plan: PlanDocument,
  grant: CapabilityGrant,
  invokes: Array<{ taskId: string; tool: string }>,
): CheckIssue[] {
  const issues: CheckIssue[] = []
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
  return issues
}

export function collectModelIssues(plan: PlanDocument, grant: CapabilityGrant): CheckIssue[] {
  const issues: CheckIssue[] = []
  const hasInfer = Object.values(plan.tasks).some((t) => t.infer !== undefined)
  if (!hasInfer) return issues
  if (grant.allowedModels.length === 0) {
    issues.push({
      code: 'EMPTY_MODELS',
      message: 'plan has infer tasks but grant.allowedModels is empty — fail-closed',
      path: 'grant.allowedModels',
    })
    return issues
  }
  const allowed = new Set(grant.allowedModels)
  if (plan.plan.model !== undefined && !allowed.has(plan.plan.model)) {
    issues.push({
      code: 'MODEL_NOT_GRANTED',
      message: `plan.model ${plan.plan.model} is not in the minted model allowlist`,
      path: 'plan.model',
    })
  }
  for (const [taskId, task] of Object.entries(plan.tasks)) {
    if (task.infer === undefined) continue
    const effective = task.infer.model ?? plan.plan.model
    if (effective === undefined || !allowed.has(effective)) {
      issues.push({
        code: 'MODEL_NOT_GRANTED',
        message:
          effective === undefined
            ? `task ${taskId} infer has no model and plan.model is unset — cannot prove membership`
            : `task ${taskId} effective model ${effective} is not in the minted model allowlist`,
        path: `tasks.${taskId}.infer.model`,
      })
    }
  }
  return issues
}

export function collectGraphShapeIssues(
  plan: PlanDocument,
  findCycle: (plan: PlanDocument) => string | null,
): CheckIssue[] {
  const issues: CheckIssue[] = []
  const taskCount = Object.keys(plan.tasks).length
  if (taskCount > MAX_PLAN_TASKS) {
    issues.push({
      code: 'TOO_MANY_TASKS',
      message: `tasks ${taskCount} exceeds max ${MAX_PLAN_TASKS}`,
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
  for (const issue of collectInvokeBindingIssues(plan.tasks)) {
    issues.push(issue)
  }
  const cycle = findCycle(plan)
  if (cycle) issues.push({ code: 'CYCLE', message: cycle })
  return issues
}

function toolNotInGrantIssue(
  tool: string,
  registry: ToolRegistry,
  path: string,
  grantedMsg: string,
  ungrantableMsg: string,
): CheckIssue {
  const grantable = registry.tools.get(tool)?.grantClass === 'mintable'
  return {
    code: grantable ? 'TOOL_NOT_GRANTED' : 'TOOL_NOT_GRANTABLE',
    message: grantable ? grantedMsg : ungrantableMsg,
    path,
  }
}

export function collectToolAuthorityIssues(
  plan: PlanDocument,
  grant: CapabilityGrant,
  registry: ToolRegistry,
  invokes: Array<{ taskId: string; tool: string }>,
): { issues: CheckIssue[]; effective: EffectiveAuthority } {
  const issues: CheckIssue[] = []
  const effective = resolveEffectiveAuthority(plan, grant, registry)
  const grantSet = new Set(grant.allowedTools)
  const planSet = new Set(plan.permits.tools)

  for (const tool of grantSet) {
    if (registry.tools.get(tool)?.grantClass !== 'mintable') {
      issues.push({
        code: 'TOOL_NOT_GRANTABLE',
        message: `grant lists ${tool}, which the pinned registry does not declare mintable`,
        path: 'grant.allowedTools',
      })
    }
  }

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
      issues.push(
        toolNotInGrantIssue(
          tool,
          registry,
          `tasks.${taskId}.invoke.tool`,
          `tool ${tool} not in org/admin capability grant`,
          `tool ${tool} is no longer mintable in the pinned registry — org policy excludes it`,
        ),
      )
    }
  }

  for (const tool of plan.permits.tools) {
    if (!grantSet.has(tool)) {
      issues.push(
        toolNotInGrantIssue(
          tool,
          registry,
          'permits.tools',
          `permits.tools lists ${tool} outside grant (plan cannot expand authority)`,
          `permits.tools lists ${tool}, which the pinned registry does not declare mintable`,
        ),
      )
    }
    if (!registry.tools.has(tool)) {
      issues.push({
        code: 'UNKNOWN_TOOL',
        message: `permits.tools lists unknown tool ${tool}`,
        path: 'permits.tools',
      })
    }
  }
  return { issues, effective }
}

export function collectTokenBudgetIssues(plan: PlanDocument): CheckIssue[] {
  const issues: CheckIssue[] = []
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
  void hard
  return issues
}
