import type { ToolRegistry } from './registry'
import type { PlanDocument } from './schema'

/**
 * Org/admin capability grant — sole source of **max power** (ADR-0005 D4).
 * Plan permits may only narrow this set.
 *
 * **Caller trust:** pure `checkPlan` validates grant shape but not provenance.
 * Apps (#31) MUST mint grants from server session / org module policy —
 * never from plan body or untrusted client JSON.
 *
 * **allowsInfer:** explicit capability for single-shot `infer` tasks (not implied
 * by tool allowlists). Ambient-infer residual closed at check (option A).
 *
 * **registryVersion** is required and must match the tool registry.version label.
 * Snapshot also seals registry.contentDigest for tool-set fingerprinting.
 */
export type CapabilityGrant = {
  orgId: string
  allowedTools: readonly string[]
  /** Must equal registry.version at check time. */
  registryVersion: string
  /**
   * When true, plan may include `infer` tasks (still subject to token ceilings).
   * When false/absent after parse, any infer task fails check.
   */
  allowsInfer: boolean
}

export type EffectiveAuthority = {
  orgId: string
  tools: readonly string[]
  grantTools: readonly string[]
  planPermitTools: readonly string[]
  allowsInfer: boolean
}

function uniqueSorted(names: readonly string[]): string[] {
  return [...new Set(names)].sort()
}

/**
 * Set intersection only — **not** an authz gate (no registry pin / schema).
 * Prefer `checkPlan` / `createRunSnapshot`. Kept package-internal.
 *
 * @capability flows-effective-authority
 * @invariant grants-are-sole-max-power: effective.tools = grants.allowedTools ∩ plan.permits.tools ∩ registry — ADR-0005 D4 § Authority split
 */
export function resolveEffectiveAuthority(
  plan: PlanDocument,
  grant: CapabilityGrant,
  registry: ToolRegistry,
): EffectiveAuthority {
  const grantSet = new Set(grant.allowedTools)
  const planSet = new Set(plan.permits.tools)
  const tools: string[] = []
  for (const name of planSet) {
    if (grantSet.has(name) && registry.tools.has(name)) {
      tools.push(name)
    }
  }
  tools.sort()
  return {
    orgId: grant.orgId,
    tools,
    grantTools: uniqueSorted(grant.allowedTools),
    planPermitTools: uniqueSorted(plan.permits.tools),
    allowsInfer: grant.allowsInfer,
  }
}
