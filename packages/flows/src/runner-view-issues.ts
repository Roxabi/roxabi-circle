/** Consistency issue collectors for parseRunnerView (Roxabi/roxabi-boilerplate-cf#287 cog-authz). */

import { hardMaxTokens, staticTokenBudget } from './budget'
import { digestPlan } from './digest-plan'
import type { PlanDocument } from './schema'

export type RunnerViewIssue = { code: string; message: string; path?: string }

function invokedToolsFromPlan(plan: PlanDocument): string[] {
  const out: string[] = []
  for (const task of Object.values(plan.tasks)) {
    if (task.invoke) out.push(task.invoke.tool)
  }
  return out
}

export function collectExecutionToolIssues(
  sealedPlan: PlanDocument,
  executionTools: string[],
): RunnerViewIssue[] {
  const issues: RunnerViewIssue[] = []
  const permitSet = new Set(sealedPlan.permits.tools)
  const execSet = new Set(executionTools)
  for (const tool of executionTools) {
    if (!permitSet.has(tool)) {
      issues.push({
        code: 'EXECUTION_TOOL_OUTSIDE_PERMITS',
        message: `executionTools lists ${tool} not in sealedPlan.permits.tools`,
        path: 'executionTools',
      })
    }
  }
  for (const tool of invokedToolsFromPlan(sealedPlan)) {
    if (!execSet.has(tool)) {
      issues.push({
        code: 'INVOKE_TOOL_NOT_IN_EXECUTION_TOOLS',
        message: `sealed invoke tool ${tool} missing from executionTools — runner must not invent dispatch`,
        path: 'executionTools',
      })
    }
  }
  return issues
}

export function collectRehydratePermitIssues(
  sealedPlan: PlanDocument,
  allowsInfer: boolean,
): RunnerViewIssue[] {
  const issues: RunnerViewIssue[] = []
  const hasInfer = Object.values(sealedPlan.tasks).some((t) => t.infer !== undefined)
  if (hasInfer && !allowsInfer) {
    issues.push({
      code: 'INFER_NOT_GRANTED',
      message: 'sealed plan has infer tasks but allowsInfer is false',
      path: 'allowsInfer',
    })
  }
  if (hasInfer && sealedPlan.permits.tools.length === 0) {
    issues.push({
      code: 'EMPTY_PERMITS',
      message: 'sealed plan has infer tasks but permits.tools is empty — fail-closed on rehydrate',
      path: 'sealedPlan.permits.tools',
    })
  }
  const hasInvoke = invokedToolsFromPlan(sealedPlan).length > 0
  if (hasInvoke && sealedPlan.permits.tools.length === 0) {
    issues.push({
      code: 'EMPTY_PERMITS',
      message: 'sealed plan has invoke tasks but permits.tools is empty — fail-closed on rehydrate',
      path: 'sealedPlan.permits.tools',
    })
  }
  return issues
}

export function collectIdentityDigestIssues(
  planId: string,
  planDigest: string,
  sealedPlan: PlanDocument,
): { issues: RunnerViewIssue[]; expectedDigest: string } {
  const issues: RunnerViewIssue[] = []
  if (planId !== sealedPlan.plan.id) {
    issues.push({
      code: 'PLAN_ID_MISMATCH',
      message: 'planId must equal sealedPlan.plan.id',
      path: 'planId',
    })
  }
  const expectedDigest = digestPlan(sealedPlan)
  if (planDigest !== expectedDigest) {
    issues.push({
      code: 'PLAN_DIGEST_MISMATCH',
      message: 'planDigest must equal digestPlan(sealedPlan) (index consistency, not crypto)',
      path: 'planDigest',
    })
  }
  return { issues, expectedDigest }
}

export function collectCeilingIssues(
  sealedPlan: PlanDocument,
  ceilings: {
    hardMaxTokens: number
    staticTokenBudget: number
    planMaxTokens?: number
  },
): {
  issues: RunnerViewIssue[]
  expectedStatic: number
  expectedHard: number
  planMax: number | undefined
} {
  const issues: RunnerViewIssue[] = []
  const expectedStatic = staticTokenBudget(sealedPlan)
  const expectedHard = hardMaxTokens(sealedPlan)
  const planMax = sealedPlan.plan.max_tokens
  if (ceilings.staticTokenBudget !== expectedStatic) {
    issues.push({
      code: 'CEILING_MISMATCH',
      message: `ceilings.staticTokenBudget ${ceilings.staticTokenBudget} !== re-derived ${expectedStatic}`,
      path: 'ceilings.staticTokenBudget',
    })
  }
  if (ceilings.hardMaxTokens !== expectedHard) {
    issues.push({
      code: 'CEILING_MISMATCH',
      message: `ceilings.hardMaxTokens ${ceilings.hardMaxTokens} !== re-derived ${expectedHard}`,
      path: 'ceilings.hardMaxTokens',
    })
  }
  if (planMax !== undefined && ceilings.planMaxTokens !== planMax) {
    issues.push({
      code: 'CEILING_MISMATCH',
      message: 'ceilings.planMaxTokens must match sealedPlan.plan.max_tokens',
      path: 'ceilings.planMaxTokens',
    })
  }
  if (planMax === undefined && ceilings.planMaxTokens !== undefined) {
    issues.push({
      code: 'CEILING_MISMATCH',
      message: 'ceilings.planMaxTokens set but sealedPlan.plan.max_tokens absent',
      path: 'ceilings.planMaxTokens',
    })
  }
  return { issues, expectedStatic, expectedHard, planMax }
}

export function collectToolEffectIssues(
  executionTools: string[],
  toolEffects: Record<string, 'read' | 'write'> | undefined,
): RunnerViewIssue[] {
  if (toolEffects === undefined) return []
  const execSet = new Set(executionTools)
  const issues: RunnerViewIssue[] = []
  for (const name of Object.keys(toolEffects)) {
    if (!execSet.has(name)) {
      issues.push({
        code: 'TOOL_EFFECT_OUTSIDE_EXECUTION_TOOLS',
        message: `toolEffects lists ${name} not in executionTools`,
        path: 'toolEffects',
      })
    }
  }
  return issues
}
