import {
  type CapabilityGrant,
  type EffectiveAuthority,
  resolveEffectiveAuthority,
} from './authority'
import { MAX_PLAN_TASKS, MAX_PLAN_TOTAL_TOKENS } from './constants'
import type { ToolRegistry } from './registry'
import type { PlanDocument } from './schema'

export type CheckIssueCode =
  | 'AGENT_DEFERRED'
  | 'EMPTY_PERMITS'
  | 'UNKNOWN_TOOL'
  | 'TOOL_NOT_GRANTED'
  | 'TOOL_NOT_IN_PERMITS'
  | 'UNKNOWN_TASK_EDGE'
  | 'CYCLE'
  | 'TOO_MANY_TASKS'
  | 'TOKEN_CEILING'
  | 'REGISTRY_VERSION_MISMATCH'
  | 'ORG_ID_REQUIRED'

export type CheckIssue = {
  code: CheckIssueCode
  message: string
  path?: string
}

export type CheckResult =
  | { ok: true; effective: EffectiveAuthority; plan: PlanDocument }
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

function staticTokenBudget(plan: PlanDocument): number {
  let sum = 0
  for (const task of Object.values(plan.tasks)) {
    if (task.infer) {
      sum += task.infer.max_tokens ?? plan.plan.max_tokens ?? 4096
    }
  }
  return sum
}

function findCycle(plan: PlanDocument): string | null {
  const ids = Object.keys(plan.tasks)
  const indeg = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const id of ids) {
    indeg.set(id, 0)
    adj.set(id, [])
  }
  for (const [id, task] of Object.entries(plan.tasks)) {
    for (const dep of task.after ?? []) {
      if (!indeg.has(dep)) continue
      adj.get(dep)?.push(id)
      indeg.set(id, (indeg.get(id) ?? 0) + 1)
    }
  }
  const q = ids.filter((id) => (indeg.get(id) ?? 0) === 0)
  let seen = 0
  while (q.length > 0) {
    const n = q.shift()
    if (!n) break
    seen++
    for (const m of adj.get(n) ?? []) {
      const next = (indeg.get(m) ?? 0) - 1
      indeg.set(m, next)
      if (next === 0) q.push(m)
    }
  }
  if (seen !== ids.length) return 'task graph contains a cycle'
  return null
}

/** Pure plan check — authority = grants ∩ plan.permits ∩ registry. */
export function checkPlan(
  plan: PlanDocument,
  grant: CapabilityGrant,
  registry: ToolRegistry,
): CheckResult {
  const issues: CheckIssue[] = []

  if (!grant.orgId || grant.orgId.trim() === '') {
    issues.push({ code: 'ORG_ID_REQUIRED', message: 'grant.orgId is required' })
  }

  if (grant.registryVersion && grant.registryVersion !== registry.version) {
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
  if (invokes.length > 0 && plan.permits.tools.length === 0) {
    issues.push({
      code: 'EMPTY_PERMITS',
      message: 'permits.tools is empty but plan invokes tools (fail-closed)',
      path: 'permits.tools',
    })
  }

  for (const [taskId, task] of Object.entries(plan.tasks)) {
    for (const dep of task.after ?? []) {
      if (!(dep in plan.tasks)) {
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
  if (plan.plan.max_tokens !== undefined && tokenBudget > plan.plan.max_tokens) {
    issues.push({
      code: 'TOKEN_CEILING',
      message: `static infer token budget ${tokenBudget} exceeds plan.max_tokens ${plan.plan.max_tokens}`,
      path: 'plan.max_tokens',
    })
  }

  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, effective, plan }
}
