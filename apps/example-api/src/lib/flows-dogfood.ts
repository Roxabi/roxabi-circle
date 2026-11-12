/**
 * Dogfood call site for @kit/flows (extract-dry-run + ADR-0005).
 * Server-owned tool registry only. Grants are minted in the flows service
 * from org module policy — never from this module, plan body, or client input.
 * **Runner path:** persist `runnerView` only; rehydrate with `parseRunnerView`.
 */
import {
  canAdminFlows,
  canCreateFlowRun,
  createToolRegistry,
  DEMO_ECHO_PLAN_YAML,
  FLOWS_MODULE_ID,
} from '@kit/flows'

export { DEMO_ECHO_PLAN_YAML, FLOWS_MODULE_ID }

// v1: the contentDigest changed with the declared grant classes (Roxabi/roxabi-boilerplate-cf#243), so the label moves with
// it — a single label covering two digests is exactly what the seal exists to make visible.
export const dogfoodToolRegistry = createToolRegistry('example-api-dogfood-v1', [
  { name: 'echo', description: 'Echo args (dogfood)', grantClass: 'mintable' },
])

export function isFlowsAdmin(input: { orgRole: string | null | undefined }): boolean {
  return canAdminFlows(input)
}

export function canDogfoodCreateRun(input: {
  orgRole: string | null | undefined
  authMethod: 'session' | 'api_key' | null | undefined
}): boolean {
  return canCreateFlowRun(input)
}
