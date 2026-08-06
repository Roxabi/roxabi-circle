/**
 * Minimal dogfood call site for @kit/flows (extract-dry-run + ADR-0005).
 * Full API/Workflows wire = #30–#31. Zero product domain strings.
 */
import {
  canAdminFlows,
  checkPlan,
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
 * Validate a YAML plan against dogfood registry + org grant.
 * Used by future admin routes; pure helper for now.
 */
export function checkDogfoodPlanYaml(
  yaml: string,
  grant: { orgId: string; allowedTools: readonly string[] },
): ReturnType<typeof checkPlan> {
  const plan: PlanDocument = loadPlanFromYaml(yaml)
  return checkPlan(plan, grant, dogfoodToolRegistry)
}

export function assertFlowsAdmin(orgRole: string | null | undefined): boolean {
  return canAdminFlows({ orgRole })
}
