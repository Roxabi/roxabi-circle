import type { ToolRegistry } from './registry'
import type { PlanDocument } from './schema'

/**
 * Org/admin capability grant — sole source of power (ADR-0005 D4).
 * Plan permits may only narrow this set.
 *
 * **Caller trust:** pure `checkPlan` validates grant shape but not provenance.
 * Apps (#31) MUST mint grants from server session / org module grants —
 * never from plan body or untrusted client JSON.
 *
 * **registryVersion** is required and must match the tool registry.version label.
 * Snapshot also seals registry.contentDigest for tool-set fingerprinting.
 */
export type CapabilityGrant = {
  orgId: string
  allowedTools: readonly string[]
  /** Must equal registry.version at check time. */
  registryVersion: string
}

export type EffectiveAuthority = {
  orgId: string
  tools: readonly string[]
  grantTools: readonly string[]
  planPermitTools: readonly string[]
}

function uniqueSorted(names: readonly string[]): string[] {
  return [...new Set(names)].sort()
}

/**
 * Set intersection only — **not** an authz gate (no registry pin / schema).
 * Prefer `checkPlan` / `createRunSnapshot`. Kept package-internal.
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
  }
}
