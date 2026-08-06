/**
 * Dogfood call site for @kit/flows (extract-dry-run + ADR-0005).
 * Exercises check + createRunSnapshot (no HTTP route / Workflows yet — #30–#31).
 * Zero product domain strings.
 *
 * **Grant provenance:** callers must pass server-derived grants only.
 * **registryVersion** must match dogfoodToolRegistry.version.
 * Runners must use snapshot.executionTools only (not grantAudit.allowedTools).
 * FLOWS_MODULE_ID reserved — not seeded until #29.
 */
import {
  type CapabilityGrant,
  type CreateSnapshotResult,
  canAdminFlows,
  canCreateFlowRun,
  createRunSnapshot,
  createToolRegistry,
  DEMO_ECHO_PLAN_YAML,
  FLOWS_MODULE_ID,
  loadPlanFromYaml,
} from '@kit/flows'

export { DEMO_ECHO_PLAN_YAML, FLOWS_MODULE_ID }

export const dogfoodToolRegistry = createToolRegistry('example-api-dogfood-v0', [
  { name: 'echo', description: 'Echo args (dogfood)', effect: 'read' },
])

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

export function isFlowsAdmin(input: {
  orgRole: string | null | undefined
  platformRole?: string | null
}): boolean {
  return canAdminFlows(input)
}

export function canDogfoodCreateRun(input: {
  orgRole: string | null | undefined
  platformRole?: string | null
  authMethod: 'session' | 'api_key' | null | undefined
}): boolean {
  return canCreateFlowRun(input)
}
