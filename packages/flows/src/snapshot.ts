import { z } from 'zod'
import type { CapabilityGrant, EffectiveAuthority } from './authority'
import { hardMaxTokens, staticTokenBudget } from './budget'
import { type CheckIssue, checkPlan } from './check'
import { fnv1a32Hex, stableStringify } from './digest'
import { deepFreeze } from './freeze'
import type { ToolRegistry } from './registry'
import { type PlanDocument, planDocumentSchema } from './schema'

/**
 * **Only** shape a runner may rehydrate from durable storage (ADR-0005).
 * Never contains grant allowlist super-set — audit grant is separate.
 */
export type RunnerView = {
  orgId: string
  actorId: string
  planId: string
  planDigest: string
  sealedPlan: PlanDocument
  /**
   * **Only** tool names a runner may invoke (grant ∩ permits ∩ registry at seal).
   */
  executionTools: readonly string[]
  /** Runtime registry.version at seal. */
  registryVersion: string
  /** Content digest of registry tool names at seal. */
  registryContentDigest: string
  ceilings: {
    /** Hard abort ceiling for runtime meter. */
    hardMaxTokens: number
    staticTokenBudget: number
    planMaxTokens?: number
  }
  /** Whether infer tasks were allowed at seal (from grant.allowsInfer). */
  allowsInfer: boolean
  createdAt: string
}

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

/**
 * Content-address index of a plan (FNV-1a 32-bit hex).
 * **Not** a cryptographic integrity control — sealedPlan body is authoritative.
 */
export function digestPlan(plan: PlanDocument): string {
  return fnv1a32Hex(stableStringify(plan))
}

/** Tools a runner may invoke from a sealed runner view. */
export function executionTools(view: RunnerView): readonly string[] {
  return view.executionTools
}

/**
 * Fail-closed rehydrate for #30 Workflows / D1.
 * Rejects grant super-set fields and executionTools outside sealed permits.
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

  const hasInfer = Object.values(data.sealedPlan.tasks).some((t) => t.infer !== undefined)
  if (hasInfer && !data.allowsInfer) {
    issues.push({
      code: 'INFER_NOT_GRANTED',
      message: 'sealed plan has infer tasks but allowsInfer is false',
      path: 'allowsInfer',
    })
  }

  if (data.planId !== data.sealedPlan.plan.id) {
    issues.push({
      code: 'PLAN_ID_MISMATCH',
      message: 'planId must equal sealedPlan.plan.id',
      path: 'planId',
    })
  }

  if (issues.length > 0) return { ok: false, issues }

  const runnerView: RunnerView = {
    orgId: data.orgId,
    actorId: data.actorId,
    planId: data.planId,
    planDigest: data.planDigest,
    sealedPlan: data.sealedPlan,
    executionTools: Object.freeze([...data.executionTools]) as readonly string[],
    registryVersion: data.registryVersion,
    registryContentDigest: data.registryContentDigest,
    ceilings: {
      hardMaxTokens: data.ceilings.hardMaxTokens,
      staticTokenBudget: data.ceilings.staticTokenBudget,
      ...(data.ceilings.planMaxTokens !== undefined
        ? { planMaxTokens: data.ceilings.planMaxTokens }
        : {}),
    },
    allowsInfer: data.allowsInfer,
    createdAt: data.createdAt,
  }

  return { ok: true, runnerView: deepFreeze(runnerView) }
}

/**
 * Seal a checked plan into a runner view + separate grant audit copy.
 * **Persist `runnerView` only** on the Workflow / execution path.
 * Store `grantAudit` separately if needed for admin audit (never for dispatch).
 */
export function createRunSnapshot(input: CreateSnapshotInput): CreateSnapshotResult {
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

  const runnerView: RunnerView = {
    orgId: checked.grant.orgId,
    actorId: input.actorId,
    planId: sealedPlan.plan.id,
    planDigest: digestPlan(sealedPlan),
    sealedPlan,
    executionTools: tools,
    registryVersion: input.registry.version,
    registryContentDigest: input.registry.contentDigest,
    ceilings: {
      hardMaxTokens: hard,
      staticTokenBudget: staticBudget,
      planMaxTokens: sealedPlan.plan.max_tokens,
    },
    allowsInfer: checked.grant.allowsInfer,
    createdAt: input.createdAt ?? new Date().toISOString(),
  }

  return {
    ok: true,
    runnerView: deepFreeze(runnerView),
    grantAudit: deepFreeze(grantAudit),
  }
}
