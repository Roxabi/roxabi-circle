/**
 * @kit/flows — governed plans + check + authority + run snapshots (ADR-0005).
 * Pure package: no Worker bindings. Apps wire Workflows + D1 + auth.
 */

export { canAdminFlows, canCreateFlowRun, isFlowsAdminRole } from './access'
export {
  type CapabilityGrant,
  type EffectiveAuthority,
  resolveEffectiveAuthority,
} from './authority'
export { staticTokenBudget } from './budget'
export {
  type CheckIssue,
  type CheckIssueCode,
  type CheckResult,
  checkPlan,
} from './check'
export {
  DEFAULT_INFER_MAX_TOKENS,
  FLOWS_ADMIN_ROLES,
  FLOWS_MODULE_ID,
  FLOWS_VERSION,
  type FlowsAdminRole,
  MAX_PERMIT_TOOLS,
  MAX_PLAN_TASKS,
  MAX_PLAN_TOTAL_TOKENS,
  MAX_PLAN_YAML_BYTES,
} from './constants'
export {
  createToolRegistry,
  type FlowToolDefinition,
  registryHas,
  registryToolNames,
  type ToolRegistry,
} from './registry'
export {
  type PlanDocument,
  type PlanPermits,
  type PlanTask,
  parsePlanDocument,
  planDocumentSchema,
  planPermitsSchema,
  planTaskSchema,
  type SafeParsePlanResult,
  safeParsePlanDocument,
} from './schema'

export {
  type CreateSnapshotInput,
  type CreateSnapshotResult,
  createRunSnapshot,
  digestPlan,
  type RunSnapshot,
} from './snapshot'
export { loadPlanFromYaml, PlanYamlError, type YamlLoadErrorCode } from './yaml'
