import type { CapabilityGrant, EffectiveAuthority } from './authority'
import { hardMaxTokens, staticTokenBudget } from './budget'
import { type CheckIssue, checkPlan } from './check'
import { digestPlan } from './digest-plan'
import { deepFreeze } from './freeze'
import type { ToolRegistry } from './registry'
import {
  executionTools,
  type ParseRunnerViewResult,
  parseRunnerView,
  RUNNER_VIEW_VERSION,
  type RunnerView,
  runnerViewSchema,
} from './runner-view'
import type { PlanDocument } from './schema'

export type { ParseRunnerViewResult, RunnerView }
export { digestPlan, executionTools, parseRunnerView, RUNNER_VIEW_VERSION, runnerViewSchema }

export type CreateSnapshotInput = {
  plan: unknown
  grant: unknown
  registry: ToolRegistry
  actorId: string
  createdAt?: string
}

export type CreateSnapshotResult =
  | { ok: true; runnerView: RunnerView; grantAudit: CapabilityGrant }
  | { ok: false; issues: CheckIssue[] }

/**
 * Seal a checked plan into a runner view + separate grant audit copy.
 * **Persist `runnerView` only** on the Workflow / execution path (`JSON.stringify(runnerView)`).
 * Store `grantAudit` separately if needed for admin audit (never for dispatch).
 */
export function createRunSnapshot(input: CreateSnapshotInput): CreateSnapshotResult {
  if (!input.actorId || input.actorId.trim() === '' || input.actorId.length > 256) {
    return {
      ok: false,
      issues: [
        {
          code: 'SCHEMA_INVALID',
          message: 'actorId is required (1..256 chars)',
          path: 'actorId',
        },
      ],
    }
  }

  const checked = checkPlan(input.plan, input.grant, input.registry)
  if (!checked.ok) return { ok: false, issues: checked.issues }

  const effective: EffectiveAuthority = checked.effective
  const sealedPlan = structuredClone(checked.plan) as PlanDocument
  const staticBudget = staticTokenBudget(sealedPlan)
  const hard = hardMaxTokens(sealedPlan)
  const grantAudit: CapabilityGrant = {
    orgId: checked.grant.orgId,
    allowedTools: [...checked.grant.allowedTools],
    registryVersion: checked.grant.registryVersion,
    allowsInfer: checked.grant.allowsInfer,
  }
  const tools = Object.freeze([...effective.tools]) as readonly string[]

  const ceilings: RunnerView['ceilings'] = {
    hardMaxTokens: hard,
    staticTokenBudget: staticBudget,
    ...(sealedPlan.plan.max_tokens !== undefined
      ? { planMaxTokens: sealedPlan.plan.max_tokens }
      : {}),
  }

  const runnerView: RunnerView = {
    runnerViewVersion: RUNNER_VIEW_VERSION,
    orgId: checked.grant.orgId,
    actorId: input.actorId,
    planId: sealedPlan.plan.id,
    planDigest: digestPlan(sealedPlan),
    sealedPlan,
    executionTools: tools,
    registryVersion: input.registry.version,
    registryContentDigest: input.registry.contentDigest,
    ceilings,
    allowsInfer: checked.grant.allowsInfer,
    createdAt: input.createdAt ?? new Date().toISOString(),
  }

  return {
    ok: true,
    runnerView: deepFreeze(runnerView),
    grantAudit: deepFreeze(grantAudit),
  }
}
