/**
 * Dogfood call site for @kit/flows (extract-dry-run + ADR-0005).
 * Exercises check + createRunSnapshot. HTTP admin compose is #31.
 * Zero product domain strings.
 *
 * **Grant:** fixed demo grant only (`echo` + allowsInfer). Free-form allowlists
 * are not exported — routes must mint grants server-side (#31).
 * **Runner path:** persist `runnerView` only; rehydrate with `parseRunnerView`.
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

/**
 * Fixed dogfood grant — tools + infer capability for demo-echo only.
 * Not a mint API: do not accept client `allowedTools`.
 */
export function dogfoodFixedGrant(orgId: string): CapabilityGrant {
  return {
    orgId,
    allowedTools: ['echo'],
    registryVersion: dogfoodToolRegistry.version,
    allowsInfer: true,
  }
}

export function dogfoodPlanToSnapshot(
  yaml: string,
  orgId: string,
  actorId: string,
): CreateSnapshotResult {
  const plan = loadPlanFromYaml(yaml)
  return createRunSnapshot({
    plan,
    grant: dogfoodFixedGrant(orgId),
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
