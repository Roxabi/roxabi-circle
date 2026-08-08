import { z } from 'zod'
import { hardMaxTokens, staticTokenBudget } from './budget'
import { digestPlan } from './digest-plan'
import { deepFreeze } from './freeze'
import type { PlanDocument } from './schema'
import { planDocumentSchema } from './schema'

/** Bump only with dual-parse / migrate story for D1 `snapshot_json`. */
export const RUNNER_VIEW_VERSION = 1 as const

/**
 * **Only** shape a runner may rehydrate from durable storage (ADR-0005).
 * Never contains grant allowlist super-set — audit grant is separate.
 *
 * **Contract:** #30 must `parseRunnerView` on every read — raw `JSON.parse` is not
 * a supported rehydrate path (convention until import-boundary/lint on Workflow module).
 */
export type RunnerView = {
  runnerViewVersion: typeof RUNNER_VIEW_VERSION
  orgId: string
  actorId: string
  planId: string
  planDigest: string
  sealedPlan: PlanDocument
  /**
   * **Only** tool names a runner may invoke (grant ∩ permits ∩ registry at seal).
   * Dispatch MUST use this set — not sealedPlan task names alone without intersection.
   */
  executionTools: readonly string[]
  registryVersion: string
  registryContentDigest: string
  ceilings: {
    hardMaxTokens: number
    staticTokenBudget: number
    planMaxTokens?: number
  }
  allowsInfer: boolean
  createdAt: string
}

export type ParseRunnerViewResult =
  | { ok: true; runnerView: RunnerView }
  | { ok: false; issues: Array<{ code: string; message: string; path?: string }> }

const toolNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/)

/**
 * Structural schema for durable rehydrate.
 * `.strict()` rejects grantAudit / effectivePermits / grantSnapshot / maxTokens alias.
 */
export const runnerViewSchema = z
  .object({
    runnerViewVersion: z.literal(RUNNER_VIEW_VERSION),
    orgId: z.string().min(1).max(256),
    actorId: z.string().min(1).max(256),
    planId: z.string().min(1).max(128),
    planDigest: z.string().min(1).max(64),
    sealedPlan: planDocumentSchema,
    executionTools: z.array(toolNameSchema).max(256),
    registryVersion: z.string().min(1).max(256),
    registryContentDigest: z.string().min(1).max(64),
    ceilings: z
      .object({
        hardMaxTokens: z.number().int().nonnegative(),
        staticTokenBudget: z.number().int().nonnegative(),
        planMaxTokens: z.number().int().positive().optional(),
      })
      .strict(),
    allowsInfer: z.boolean(),
    createdAt: z.string().min(1).max(64),
  })
  .strict()

/** Tools a runner may invoke from a sealed runner view. */
export function executionTools(view: RunnerView): readonly string[] {
  return view.executionTools
}

function invokedToolsFromPlan(plan: PlanDocument): string[] {
  const out: string[] = []
  for (const task of Object.values(plan.tasks)) {
    if (task.invoke) out.push(task.invoke.tool)
  }
  return out
}

/**
 * Fail-closed rehydrate for #30 Workflows / D1.
 * Consistency checks (not full grant re-mint): tools, infer, ceilings, digests.
 * Does **not** prove grant provenance — that remains app mint at create-run (#31).
 */
export function parseRunnerView(input: unknown): ParseRunnerViewResult {
  const parsed = runnerViewSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((zi) => ({
        code: 'RUNNER_VIEW_INVALID',
        message: zi.message,
        path: zi.path.length ? zi.path.join('.') : undefined,
      })),
    }
  }
  const data = parsed.data
  const permitSet = new Set(data.sealedPlan.permits.tools)
  const execSet = new Set(data.executionTools)
  const issues: Array<{ code: string; message: string; path?: string }> = []

  for (const tool of data.executionTools) {
    if (!permitSet.has(tool)) {
      issues.push({
        code: 'EXECUTION_TOOL_OUTSIDE_PERMITS',
        message: `executionTools lists ${tool} not in sealedPlan.permits.tools`,
        path: 'executionTools',
      })
    }
  }

  for (const tool of invokedToolsFromPlan(data.sealedPlan)) {
    if (!execSet.has(tool)) {
      issues.push({
        code: 'INVOKE_TOOL_NOT_IN_EXECUTION_TOOLS',
        message: `sealed invoke tool ${tool} missing from executionTools — runner must not invent dispatch`,
        path: 'executionTools',
      })
    }
  }

  const hasInfer = Object.values(data.sealedPlan.tasks).some((t) => t.infer !== undefined)
  if (hasInfer && !data.allowsInfer) {
    issues.push({
      code: 'INFER_NOT_GRANTED',
      message: 'sealed plan has infer tasks but allowsInfer is false',
      path: 'allowsInfer',
    })
  }
  if (hasInfer && data.sealedPlan.permits.tools.length === 0) {
    issues.push({
      code: 'EMPTY_PERMITS',
      message: 'sealed plan has infer tasks but permits.tools is empty — fail-closed on rehydrate',
      path: 'sealedPlan.permits.tools',
    })
  }
  const hasInvoke = invokedToolsFromPlan(data.sealedPlan).length > 0
  if (hasInvoke && data.sealedPlan.permits.tools.length === 0) {
    issues.push({
      code: 'EMPTY_PERMITS',
      message: 'sealed plan has invoke tasks but permits.tools is empty — fail-closed on rehydrate',
      path: 'sealedPlan.permits.tools',
    })
  }

  if (data.planId !== data.sealedPlan.plan.id) {
    issues.push({
      code: 'PLAN_ID_MISMATCH',
      message: 'planId must equal sealedPlan.plan.id',
      path: 'planId',
    })
  }

  const expectedDigest = digestPlan(data.sealedPlan)
  if (data.planDigest !== expectedDigest) {
    issues.push({
      code: 'PLAN_DIGEST_MISMATCH',
      message: 'planDigest must equal digestPlan(sealedPlan) (index consistency, not crypto)',
      path: 'planDigest',
    })
  }

  const expectedStatic = staticTokenBudget(data.sealedPlan)
  const expectedHard = hardMaxTokens(data.sealedPlan)
  if (data.ceilings.staticTokenBudget !== expectedStatic) {
    issues.push({
      code: 'CEILING_MISMATCH',
      message: `ceilings.staticTokenBudget ${data.ceilings.staticTokenBudget} !== re-derived ${expectedStatic}`,
      path: 'ceilings.staticTokenBudget',
    })
  }
  if (data.ceilings.hardMaxTokens !== expectedHard) {
    issues.push({
      code: 'CEILING_MISMATCH',
      message: `ceilings.hardMaxTokens ${data.ceilings.hardMaxTokens} !== re-derived ${expectedHard}`,
      path: 'ceilings.hardMaxTokens',
    })
  }
  const planMax = data.sealedPlan.plan.max_tokens
  if (planMax !== undefined && data.ceilings.planMaxTokens !== planMax) {
    issues.push({
      code: 'CEILING_MISMATCH',
      message: 'ceilings.planMaxTokens must match sealedPlan.plan.max_tokens',
      path: 'ceilings.planMaxTokens',
    })
  }
  if (planMax === undefined && data.ceilings.planMaxTokens !== undefined) {
    issues.push({
      code: 'CEILING_MISMATCH',
      message: 'ceilings.planMaxTokens set but sealedPlan.plan.max_tokens absent',
      path: 'ceilings.planMaxTokens',
    })
  }

  if (issues.length > 0) return { ok: false, issues }

  const runnerView: RunnerView = {
    runnerViewVersion: RUNNER_VIEW_VERSION,
    orgId: data.orgId,
    actorId: data.actorId,
    planId: data.planId,
    planDigest: expectedDigest,
    sealedPlan: data.sealedPlan,
    executionTools: Object.freeze([...data.executionTools]) as readonly string[],
    registryVersion: data.registryVersion,
    registryContentDigest: data.registryContentDigest,
    ceilings: {
      hardMaxTokens: expectedHard,
      staticTokenBudget: expectedStatic,
      ...(planMax !== undefined ? { planMaxTokens: planMax } : {}),
    },
    allowsInfer: data.allowsInfer,
    createdAt: data.createdAt,
  }

  return { ok: true, runnerView: deepFreeze(runnerView) }
}
