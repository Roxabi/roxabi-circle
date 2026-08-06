import type { CapabilityGrant, EffectiveAuthority } from './authority'
import { hardMaxTokens, staticTokenBudget } from './budget'
import { type CheckIssue, checkPlan } from './check'
import { deepFreeze } from './freeze'
import type { ToolRegistry } from './registry'
import type { PlanDocument } from './schema'

export type RunSnapshot = {
  orgId: string
  actorId: string
  planId: string
  planDigest: string
  sealedPlan: PlanDocument
  /**
   * **Only** tool names a runner may invoke (grant ∩ permits ∩ registry).
   * Do not authorize from grantAudit.allowedTools.
   */
  executionTools: readonly string[]
  /** @deprecated alias of executionTools — prefer executionTools */
  effectivePermits: { tools: readonly string[] }
  /**
   * Audit copy of the grant (full allowlist). **Not** the execution allowlist.
   * Runners MUST NOT use this for tool dispatch.
   */
  grantAudit: CapabilityGrant
  /** @deprecated use grantAudit */
  grantSnapshot: CapabilityGrant
  /** Runtime registry.version at seal. */
  registryVersion: string
  /** Content digest of registry tool names at seal. */
  registryContentDigest: string
  ceilings: {
    /** Hard abort ceiling for runtime meter. */
    hardMaxTokens: number
    /** Alias of hardMaxTokens for older callers. */
    maxTokens: number
    staticTokenBudget: number
    planMaxTokens?: number
  }
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

/** Tools a runner may invoke from a sealed snapshot. */
export function executionTools(snapshot: RunSnapshot): readonly string[] {
  return snapshot.executionTools
}

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
  }
  const tools = Object.freeze([...effective.tools]) as readonly string[]

  const snapshot: RunSnapshot = {
    orgId: checked.grant.orgId,
    actorId: input.actorId,
    planId: sealedPlan.plan.id,
    planDigest: digestPlan(sealedPlan),
    sealedPlan,
    executionTools: tools,
    effectivePermits: { tools },
    grantAudit,
    grantSnapshot: grantAudit,
    registryVersion: input.registry.version,
    registryContentDigest: input.registry.contentDigest,
    ceilings: {
      hardMaxTokens: hard,
      maxTokens: hard,
      staticTokenBudget: staticBudget,
      planMaxTokens: sealedPlan.plan.max_tokens,
    },
    createdAt: input.createdAt ?? new Date().toISOString(),
  }

  return { ok: true, snapshot: deepFreeze(snapshot) }
}
