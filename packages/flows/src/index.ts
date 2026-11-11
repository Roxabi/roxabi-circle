/**
 * @kit/flows — governed plans + check + authority + run snapshots (ADR-0005).
 * Pure package: no Worker bindings. Apps wire Workflows + D1 + auth.
 *
 * **Incubating** — promote only with schema-stable dogfood + second call site (D6).
 * Tool registry is forked from MCP `createToolCatalogue` by decision (ADR-0005 D6 amendment):
 * declarations + authority class here, executable tools there. Unifying is a promote that
 * replaces both callers — never a third factory sitting beside them (M-04).
 * The authority-bearing class is `grantClass`; `effect` on a flows registry entry is a kit-side
 * **retry** hint only (Roxabi/roxabi-boilerplate-cf#234) — never mint / check / digest input. The `@kit/mcp` `effect` stays
 * descriptive and non-authorization (Roxabi/roxabi-boilerplate-cf#243). Do not conflate the two.
 * Runner path: persist/rehydrate `RunnerView` via `parseRunnerView` only — never raw
 * grant allowlists. Grant provenance is kit-owned: `mintCapabilityGrant` mints
 * server-side from caller-resolved org module policy facts; permits may only narrow.
 */

export type { CapabilityGrant, EffectiveAuthority } from './authority'

export {
  ARG_KEY_FORBIDDEN_RE,
  BindingUnresolvedError,
  bindingTaskIds,
  resolveWholeBindings,
  unionAfterWithBindings,
  WHOLE_BINDING_RE,
  walkArgsBindings,
} from './bindings'
export { hardMaxTokens, staticTokenBudget } from './budget'
export {
  DEFAULT_APPROVE_TIMEOUT_HOURS,
  DEFAULT_INFER_MAX_TOKENS,
  FLOWS_ADMIN_ROLES,
  FLOWS_MODULE_ID,
  FLOWS_VERSION,
  type FlowsAdminRole,
  MAX_ALLOWED_MODELS,
  MAX_MODEL_ID_CHARS,
  MAX_PERMIT_TOOLS,
  MAX_PLAN_TASKS,
  MAX_PLAN_TOTAL_TOKENS,
  MAX_PLAN_YAML_BYTES,
} from './constants'
export {
  createToolRegistry,
  type FlowToolDefinition,
  type FlowToolEffect,
  registryHas,
  registryToolNames,
  type ToolGrantClass,
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
export { loadPlanFromYaml, PlanYamlError, type YamlLoadErrorCode } from './yaml'

// resolveEffectiveAuthority is intentionally NOT exported (unsafe without pin).

export {
  canAdminFlows,
  canCancelFlowRun,
  canCreateFlowRun,
  canDecideFlowApproval,
  isFlowsAdminRole,
} from './access'
export { flowApprovalEventType, isApproveTask } from './approve'
export {
  type CheckIssue,
  type CheckIssueCode,
  type CheckResult,
  checkPlan,
} from './check'
export { sha256Hex } from './digest'
export { DEMO_ECHO_PLAN_YAML } from './fixtures/demo-echo'
export { capabilityGrantSchema, parseCapabilityGrant } from './grant'
export {
  type InterpretRollup,
  type InterpretRunResult,
  type InterpretStuckCode,
  interpretRun,
} from './interpret'
export {
  type MintDenyCode,
  type MintGrantInput,
  type MintGrantResult,
  mintCapabilityGrant,
  type OrgPolicyFacts,
} from './mint'
export {
  FLOW_RUN_STATUSES,
  type FlowRunStatus,
  type ParseReceiptsResult,
  parseReceipts,
  RECEIPT_OUTPUT_MAX_CHARS,
  REDACTED_OUTPUT_MARKER,
  type ReceiptBundle,
  readRunRollup,
  receiptBundleSchema,
  TASK_RECEIPT_OUTCOMES,
  type TaskReceipt,
  type TaskReceiptOutcome,
} from './receipts'
export { FLOW_RUN_ERROR_CODES, type FlowRunErrorCode } from './run-error'
export {
  type CreateSnapshotInput,
  type CreateSnapshotResult,
  createRunSnapshot,
  digestPlan,
  executionTools,
  type ParseRunnerViewResult,
  parseRunnerView,
  RUNNER_VIEW_VERSION,
  type RunnerView,
  runnerViewSchema,
} from './snapshot'
