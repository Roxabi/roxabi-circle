/**
 * Dogfood call site for @kit/flows (extract-dry-run + ADR-0005).
 * Exercises check + createRunSnapshot (no HTTP route / Workflows yet — #30–#31).
 * Zero product domain strings.
 *
 * **Grant provenance:** callers must pass server-derived grants only
 * (org module tools / admin policy) — never plan body or client JSON.
 */
import {
  type CapabilityGrant,
  type CreateSnapshotResult,
  canAdminFlows,
  createRunSnapshot,
  createToolRegistry,
  FLOWS_MODULE_ID,
  loadPlanFromYaml,
  type PlanDocument,
} from '@kit/flows'

/** Kit module catalogue id — register in platform_modules (#29). */
export { FLOWS_MODULE_ID }

/** Built-in dogfood tools (generic only). */
export const dogfoodToolRegistry = createToolRegistry('example-api-dogfood-v0', [
  { name: 'echo', description: 'Echo args (dogfood)', effect: 'read' },
])

/**
 * Load YAML → check → freeze run snapshot (pure composition path).
 * `grant` must be server-built (see CapabilityGrant docs).
 */
export function dogfoodPlanToSnapshot(
  yaml: string,
  grant: CapabilityGrant,
  actorId: string,
): CreateSnapshotResult {
  const plan: PlanDocument = loadPlanFromYaml(yaml)
  return createRunSnapshot({
    plan,
    grant,
    registry: dogfoodToolRegistry,
    actorId,
  })
}

/** V0 admin gate — pass through full access input (incl. platformRole). */
export function isFlowsAdmin(input: {
  orgRole: string | null | undefined
  platformRole?: string | null
}): boolean {
  return canAdminFlows(input)
}
