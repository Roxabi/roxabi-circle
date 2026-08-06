import type { CapabilityGrant, EffectiveAuthority } from './authority'
import { staticTokenBudget } from './budget'
import { type CheckIssue, checkPlan } from './check'
import type { ToolRegistry } from './registry'
import type { PlanDocument } from './schema'

export type RunSnapshot = {
  orgId: string
  actorId: string
  planId: string
  planDigest: string
  sealedPlan: PlanDocument
  effectivePermits: { tools: readonly string[] }
  grantSnapshot: CapabilityGrant
  /** Runtime registry.version at seal (not a forged grant pin). */
  registryVersion: string
  ceilings: {
    /** Hard static ceiling (= staticTokenBudget). */
    maxTokens: number
    staticTokenBudget: number
  }
  createdAt: string
}

export type CreateSnapshotInput = {
  /** Raw plan — re-validated via Zod inside checkPlan. */
  plan: unknown
  grant: CapabilityGrant
  registry: ToolRegistry
  actorId: string
  createdAt?: string
}

export type CreateSnapshotResult =
  | { ok: true; snapshot: RunSnapshot }
  | { ok: false; issues: CheckIssue[] }

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

/**
 * Content-address index of a plan (FNV-1a 32-bit hex).
 * **Not** a cryptographic integrity control — sealedPlan body is authoritative.
 */
export function digestPlan(plan: PlanDocument): string {
  const s = stableStringify(plan)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function createRunSnapshot(input: CreateSnapshotInput): CreateSnapshotResult {
  const checked = checkPlan(input.plan, input.grant, input.registry)
  if (!checked.ok) return { ok: false, issues: checked.issues }

  const effective: EffectiveAuthority = checked.effective
  const sealedPlan = structuredClone(checked.plan) as PlanDocument
  const budget = staticTokenBudget(sealedPlan)
  const grantSnapshot: CapabilityGrant = {
    orgId: input.grant.orgId,
    allowedTools: [...input.grant.allowedTools],
    registryVersion: input.grant.registryVersion,
  }

  return {
    ok: true,
    snapshot: {
      orgId: input.grant.orgId,
      actorId: input.actorId,
      planId: sealedPlan.plan.id,
      planDigest: digestPlan(sealedPlan),
      sealedPlan,
      effectivePermits: { tools: [...effective.tools] },
      grantSnapshot,
      registryVersion: input.registry.version,
      ceilings: {
        maxTokens: budget,
        staticTokenBudget: budget,
      },
      createdAt: input.createdAt ?? new Date().toISOString(),
    },
  }
}
