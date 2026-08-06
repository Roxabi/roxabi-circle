/**
 * Dogfood call site for @kit/flows (extract-dry-run + ADR-0005).
 * Exercises check + createRunSnapshot (no HTTP route / Workflows yet — #30–#31).
 * Zero product domain strings.
 *
 * **Grant provenance:** callers must pass server-derived grants only
 * (org module tools / admin policy) — never plan body or client JSON.
 * **registryVersion** must match dogfoodToolRegistry.version (required pin).
 * FLOWS_MODULE_ID is reserved — not seeded in kit_modules until #29.
 */
import {
  type CapabilityGrant,
  type CreateSnapshotResult,
  canAdminFlows,
  canCreateFlowRun,
  createRunSnapshot,
  createToolRegistry,
  FLOWS_MODULE_ID,
  loadPlanFromYaml,
} from '@kit/flows'

/** Kit module catalogue id — register in platform_modules (#29). Not seeded yet. */
export { FLOWS_MODULE_ID }

/** Built-in dogfood tools (generic only). */
export const dogfoodToolRegistry = createToolRegistry('example-api-dogfood-v0', [
  { name: 'echo', description: 'Echo args (dogfood)', effect: 'read' },
])

/** Server-built dogfood grant (never from client). */
export function dogfoodGrant(
  orgId: string,
  allowedTools: readonly string[] = ['echo'],
): CapabilityGrant {
  return {
    orgId,
    allowedTools,
    registryVersion: dogfoodToolRegistry.version,
  }
}

/**
 * YAML → Zod re-validate (inside check) → freeze run snapshot.
 */
export function dogfoodPlanToSnapshot(
  yaml: string,
  grant: CapabilityGrant,
  actorId: string,
): CreateSnapshotResult {
  const plan = loadPlanFromYaml(yaml)
  return createRunSnapshot({
    plan,
    grant,
    registry: dogfoodToolRegistry,
    actorId,
  })
}

/** V0 admin role gate — not sufficient alone for create-run (use canDogfoodCreateRun). */
export function isFlowsAdmin(input: {
  orgRole: string | null | undefined
  platformRole?: string | null
}): boolean {
  return canAdminFlows(input)
}

/** Create-run gate — requires explicit session authMethod. */
export function canDogfoodCreateRun(input: {
  orgRole: string | null | undefined
  platformRole?: string | null
  authMethod: 'session' | 'api_key' | null | undefined
}): boolean {
  return canCreateFlowRun(input)
}
